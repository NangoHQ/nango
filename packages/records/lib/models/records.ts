import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import tracer from 'dd-trace';

import { Err, Ok, retry, stringToHash } from '@nangohq/utils';

import { RECORDS_TABLE, RECORD_COUNTS_TABLE } from '../constants.js';
import { Cursor } from '../cursor.js';
import { db, dbRead } from '../db/client.js';
import { envs } from '../env.js';
import { deepMergeRecordData } from '../helpers/merge.js';
import { getUniqueId, removeDuplicateKey } from '../helpers/uniqueKey.js';
import { decryptRecordData, encryptRecords } from '../utils/encryption.js';
import { logger } from '../utils/logger.js';

import type {
    CombinedFilterAction,
    FormattedRecord,
    FormattedRecordWithMetadata,
    GetRecordsResponse,
    LastAction,
    RecordCount,
    ReturnedRecord,
    UpsertSummary
} from '../types.js';
import type { CursorOffset, MergingStrategy } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

dayjs.extend(utc);

const BATCH_SIZE = envs.RECORDS_BATCH_SIZE;

interface UpsertResult {
    external_id: string;
    id: string;
    last_modified_at: string;
    previous_last_modified_at: string | null;
    size_bytes: number;
    previous_size_bytes: number | null;
    status: 'inserted' | 'changed' | 'undeleted' | 'deleted' | 'unchanged';
}

function isInactiveThisMonth(record: { last_modified_at: string | Date; previous_last_modified_at: string | Date }): boolean {
    const firstDayOfMonth = dayjs().utc().startOf('month');
    const previousLastModifiedAt = dayjs(record.previous_last_modified_at).utc();
    return previousLastModifiedAt.isBefore(firstDayOfMonth);
}

function getInactiveThisMonth(records: UpsertResult[]): UpsertResult[] {
    return records.filter((r) => {
        if (!r.previous_last_modified_at) {
            return true;
        }
        return isInactiveThisMonth({ last_modified_at: r.last_modified_at, previous_last_modified_at: r.previous_last_modified_at });
    });
}

/**
 * Get Records is using the read replicas (when possible)
 */
export async function getRecords({
    connectionId,
    model,
    modifiedAfter,
    limit,
    filter,
    cursor,
    externalIds
}: {
    connectionId: number;
    model: string;
    modifiedAfter?: string | undefined;
    limit?: number | string | undefined;
    filter?: CombinedFilterAction | LastAction | undefined;
    cursor?: string | undefined;
    externalIds?: string[] | undefined;
}): Promise<Result<GetRecordsResponse>> {
    const activeSpan = tracer.scope().active();
    const span = tracer.startSpan('nango.records.getRecords', {
        ...(activeSpan ? { childOf: activeSpan } : {}),
        tags: { 'nango.connectionId': connectionId, 'nango.model': model }
    });
    try {
        if (!model) {
            const error = new Error('missing_model');
            return Err(error);
        }

        let query = dbRead
            .from<FormattedRecord>(RECORDS_TABLE)
            .timeout(60000) // timeout after 1 minute
            .where({
                connection_id: connectionId,
                model
            })
            .orderBy([
                { column: 'updated_at', order: 'asc' },
                { column: 'id', order: 'asc' }
            ]);

        if (cursor) {
            const decodedCursor = Cursor.from(cursor);
            if (!decodedCursor) {
                const error = new Error('invalid_cursor_value');
                return Err(error);
            }

            // Tuple comparison for efficient index usage
            query = query.whereRaw('(updated_at, id) > (?, ?)', [decodedCursor.sort, decodedCursor.id]);
        }

        if (externalIds) {
            // postgresql does not support null bytes in strings
            const cleanIds = externalIds.map((id) => id.replaceAll('\x00', ''));
            query = query.whereIn('external_id', cleanIds);
        }

        if (limit) {
            if (isNaN(Number(limit))) {
                const error = new Error('invalid_limit');
                return Err(error);
            }
            query = query.limit(Number(limit) + 1);
        } else {
            query = query.limit(101);
        }

        if (modifiedAfter) {
            const time = dayjs(modifiedAfter);

            if (!time.isValid()) {
                const error = new Error('invalid_timestamp');
                return Err(error);
            }

            const formattedDelta = time.toISOString();

            query = query.andWhere('updated_at', '>=', formattedDelta);
        }

        if (filter) {
            const formattedFilter = filter.toUpperCase();
            switch (true) {
                case formattedFilter.includes('ADDED') && formattedFilter.includes('UPDATED'):
                    query = query.andWhere('deleted_at', null).andWhere(function () {
                        void this.where('created_at', '=', db.raw('updated_at')).orWhere('created_at', '!=', db.raw('updated_at'));
                    });
                    break;
                case formattedFilter.includes('UPDATED') && formattedFilter.includes('DELETED'):
                    query = query.andWhere(function () {
                        void this.where('deleted_at', null).andWhere('created_at', '!=', db.raw('updated_at'));
                    });
                    break;
                case formattedFilter.includes('ADDED') && formattedFilter.includes('DELETED'):
                    query = query.andWhere(function () {
                        void this.where('deleted_at', null).andWhere('created_at', '=', db.raw('updated_at'));
                    });
                    break;
                case formattedFilter === 'ADDED':
                    query = query.andWhere('deleted_at', null).andWhere('created_at', '=', db.raw('updated_at'));
                    break;
                case formattedFilter === 'UPDATED':
                    query = query.andWhere('deleted_at', null).andWhere('created_at', '!=', db.raw('updated_at'));
                    break;
                case formattedFilter === 'DELETED':
                    query = query.andWhereNot({ deleted_at: null });
                    break;
            }
        }

        const rawResults: FormattedRecordWithMetadata[] = await query.select(
            // PostgreSQL stores timestamp with microseconds precision
            // however, javascript date only supports milliseconds precision
            // we therefore convert timestamp to string (using to_json()) in order to avoid precision loss
            db.raw(`
                tableoid::regclass as partition,
                id,
                external_id,
                json,
                to_json(created_at) as first_seen_at,
                to_json(updated_at) as last_modified_at,
                to_json(deleted_at) as deleted_at,
                to_json(pruned_at) as pruned_at,
                CASE
                    WHEN deleted_at IS NOT NULL THEN 'DELETED'
                    WHEN created_at = updated_at THEN 'ADDED'
                    ELSE 'UPDATED'
                END as last_action
            `)
        );

        if (rawResults.length === 0) {
            return Ok({ records: [], next_cursor: null });
        }

        const results: ReturnedRecord[] = [];

        // TODO: decrypt in batch
        for (const item of rawResults) {
            const decryptedData = await decryptRecordData(item);
            results.push({
                ...decryptedData,
                id: item.external_id, // record payload can be empty (when pruned), always use external_id as id
                _nango_metadata: {
                    first_seen_at: item.first_seen_at,
                    last_modified_at: item.last_modified_at,
                    last_action: item.last_action,
                    deleted_at: item.deleted_at,
                    pruned_at: item.pruned_at,
                    cursor: Cursor.new(item)
                }
            });
        }

        // all records for the same connection/model are in the same partition
        const partition = rawResults[0]?.partition;
        if (span && partition) {
            span.setTag('nango.partition', partition);
        }

        if (results.length > Number(limit || 100)) {
            results.pop();
            rawResults.pop();

            const cursorRawElement = rawResults[rawResults.length - 1];
            if (cursorRawElement) {
                const encodedCursorValue = Cursor.new(cursorRawElement);
                return Ok({ records: results, next_cursor: encodedCursorValue });
            }
        }

        return Ok({ records: results, next_cursor: null });
    } catch (err) {
        const e = new Error(`List records error for model ${model}`, { cause: err });
        span.setTag('error', e);
        return Err(e);
    } finally {
        span.finish();
    }
}

export async function getCursor({
    connectionId,
    model,
    offset
}: {
    connectionId: number;
    model: string;
    offset: CursorOffset;
}): Promise<Result<string | undefined>> {
    const activeSpan = tracer.scope().active();
    const span = tracer.startSpan('nango.records.getCursor', {
        ...(activeSpan ? { childOf: activeSpan } : {}),
        tags: { 'nango.connectionId': connectionId, 'nango.model': model }
    });
    try {
        const query = db
            .from(RECORDS_TABLE)
            .select<{ id: string; last_modified_at: string; partition: string }[]>(
                // PostgreSQL stores timestamp with microseconds precision
                // however, javascript date only supports milliseconds precision
                // we therefore convert timestamp to string (using to_json()) in order to avoid precision loss
                db.raw(`
                    id,
                    to_json(updated_at) as last_modified_at,
                    tableoid::regclass as partition
                `)
            )
            .where({
                connection_id: connectionId,
                model
            })
            .orderBy([
                { column: 'updated_at', order: offset === 'first' ? 'asc' : 'desc' },
                { column: 'id', order: offset === 'first' ? 'asc' : 'desc' }
            ])
            .limit(1);

        const [record] = await query;

        if (!record) {
            return Ok(undefined);
        }
        span.setTag('nango.partition', record.partition);
        return Ok(Cursor.new(record));
    } catch (err) {
        span.setTag('error', err);
        return Err(new Error(`Error getting cursor for offset ${offset}`, { cause: err }));
    } finally {
        span.finish();
    }
}

export async function upsert({
    records,
    connectionId,
    environmentId,
    model,
    softDelete = false,
    merging = { strategy: 'override' }
}: {
    records: FormattedRecord[];
    connectionId: number;
    environmentId: number;
    model: string;
    softDelete?: boolean;
    merging?: MergingStrategy;
}): Promise<Result<UpsertSummary>> {
    const activeSpan = tracer.scope().active();
    const span = tracer.startSpan('nango.records.upsert', {
        ...(activeSpan ? { childOf: activeSpan } : {}),
        tags: { 'nango.connectionId': connectionId, 'nango.model': model, 'nango.softDelete': softDelete }
    });
    let partition: string | undefined = undefined;

    const { records: recordsWithoutDuplicates, nonUniqueKeys } = removeDuplicateKey(records);
    try {
        if (!recordsWithoutDuplicates || recordsWithoutDuplicates.length === 0) {
            return Err(
                `There are no records to upsert because there were no records that were not duplicates to insert, but there were ${records.length} records received for the "${model}" model.`
            );
        }
        return await retry(
            () => {
                return db.transaction(async (trx) => {
                    // Lock to prevent concurrent upserts
                    await trx.raw(`SELECT pg_advisory_xact_lock(?) as lock_records_${softDelete ? 'delete' : 'upsert'}`, [newLockId(connectionId, model)]);

                    const summary: UpsertSummary = {
                        addedKeys: [],
                        updatedKeys: [],
                        deletedKeys: [],
                        nonUniqueKeys,
                        nextMerging: merging,
                        activatedKeys: [],
                        unchangedKeys: []
                    };
                    let deltaSizeInBytes = 0;
                    for (let i = 0; i < recordsWithoutDuplicates.length; i += BATCH_SIZE) {
                        const chunk = recordsWithoutDuplicates.slice(i, i + BATCH_SIZE);
                        const encryptedRecords = encryptRecords(chunk);

                        // we need to know which records were updated, deleted, undeleted or unchanged
                        // we achieve this by comparing the records data_hash and deleted_at fields before and after the update
                        const externalIds = chunk.map((r) => r.external_id);
                        const res = await trx
                            .with('existing', (qb) => {
                                qb.select(
                                    'external_id',
                                    'data_hash',
                                    'deleted_at',
                                    'updated_at',
                                    trx.raw('pg_column_size(json) as size_bytes'),
                                    trx.raw('tableoid::regclass as partition')
                                )
                                    .from(RECORDS_TABLE)
                                    .where({
                                        connection_id: connectionId,
                                        model
                                    })
                                    .whereIn('external_id', externalIds);
                            })
                            .with('upsert', (qb) => {
                                qb.insert(encryptedRecords)
                                    .into(RECORDS_TABLE)
                                    .returning([
                                        'id',
                                        'external_id',
                                        'data_hash',
                                        'deleted_at',
                                        'updated_at',
                                        trx.raw('pg_column_size(json) as size_bytes'),
                                        trx.raw('tableoid::regclass as partition')
                                    ])
                                    .onConflict(['connection_id', 'external_id', 'model'])
                                    .merge();
                                if (merging.strategy === 'ignore_if_modified_after_cursor' && merging.cursor) {
                                    const cursor = Cursor.from(merging.cursor);
                                    if (cursor) {
                                        qb.whereRaw(`(${RECORDS_TABLE}.updated_at, ${RECORDS_TABLE}.id) <= (?, ?)`, [cursor.sort, cursor.id]);
                                    }
                                }
                            })
                            .select<(UpsertResult & { partition: string })[]>(
                                trx.raw(`
                                    coalesce(upsert.partition, existing.partition) as partition,
                                    upsert.id as id,
                                    upsert.external_id as external_id,
                                    to_json(upsert.updated_at) as last_modified_at,
                                    upsert.size_bytes as size_bytes,
                                    existing.size_bytes as previous_size_bytes,
                                    CASE
                                      WHEN existing.updated_at IS NULL THEN NULL
                                      ELSE to_json(existing.updated_at)
                                    END as previous_last_modified_at,
                                    CASE
                                        WHEN existing.external_id IS NULL THEN 'inserted'
                                        ELSE
                                            CASE
                                                WHEN existing.deleted_at IS NOT NULL AND upsert.deleted_at IS NULL THEN 'undeleted'
                                                WHEN existing.deleted_at IS NULL AND upsert.deleted_at IS NOT NULL THEN 'deleted'
                                                WHEN existing.data_hash <> upsert.data_hash THEN 'changed'
                                                ELSE 'unchanged'
                                            END
                                    END as status`)
                            )
                            .from('upsert')
                            .leftJoin('existing', 'upsert.external_id', 'existing.external_id')
                            .orderBy([
                                { column: 'upsert.updated_at', order: 'asc' },
                                { column: 'upsert.id', order: 'asc' }
                            ]);

                        // Billing:
                        // A record is billed only once per month. ie:
                        // - If a record is inserted, it is billed
                        // - If a record is updated, it is billed if it has not been billed yet during the current month
                        // - If a record is undeleted, it is not billed
                        // - If a record is deleted, it is not billed

                        if (softDelete) {
                            const deleted = res.filter((r) => r.status === 'deleted');
                            summary.deletedKeys?.push(...deleted.map((r) => r.external_id));
                        } else {
                            const undeletedRes = res.filter((r) => r.status === 'undeleted');
                            const changedRes = res.filter((r) => r.status === 'changed');

                            const insertedKeys = res.filter((r) => r.status === 'inserted').map((r) => r.external_id);
                            const undeletedKeys = undeletedRes.map((r) => r.external_id);
                            const addedKeys = insertedKeys.concat(undeletedKeys);
                            const updatedKeys = changedRes.map((r) => r.external_id);
                            const activatedKeys = [...insertedKeys, ...getInactiveThisMonth(changedRes).map((r) => r.external_id)];

                            summary.addedKeys.push(...addedKeys);
                            summary.updatedKeys.push(...updatedKeys);
                            summary.activatedKeys.push(...activatedKeys);
                            summary.unchangedKeys.push(...res.filter((r) => r.status === 'unchanged').map((r) => r.external_id));
                        }

                        if (merging.strategy === 'ignore_if_modified_after_cursor') {
                            // Next cursor is the last MODIFIED record
                            const getLastModifiedRecord = (records: UpsertResult[]): UpsertResult | undefined => {
                                for (let i = records.length - 1; i >= 0; i--) {
                                    if (records[i]?.status !== 'unchanged') {
                                        return records[i];
                                    }
                                }
                                return undefined;
                            };
                            const lastRecord = getLastModifiedRecord(res);
                            if (lastRecord) {
                                summary.nextMerging = {
                                    strategy: merging.strategy,
                                    cursor: Cursor.new(lastRecord)
                                };
                            }
                        }
                        deltaSizeInBytes += res.reduce((acc, r) => acc + (r.size_bytes - (r.previous_size_bytes || 0)), 0);

                        // all records for the same connection/model are in the same partition
                        if (!partition && res[0]?.partition) {
                            partition = res[0].partition;
                        }
                    }
                    const delta = summary.addedKeys.length - (summary.deletedKeys?.length ?? 0);
                    await incrCount(trx, {
                        connectionId,
                        environmentId,
                        model,
                        delta,
                        deltaSizeInBytes
                    });
                    if (partition) {
                        span.setTag('nango.partition', partition);
                    }
                    return Ok(summary);
                });
            },
            // Retry if deadlock detected
            // https://www.postgresql.org/docs/current/mvcc-serialization-failure-handling.html
            {
                maxAttempts: 3,
                delayMs: 500,
                retryOnError: (err) => {
                    if ('code' in err) {
                        const errorCode = (err as { code: string }).code;
                        return errorCode === '40P01'; // deadlock_detected
                    }
                    return false;
                }
            }
        );
    } catch (err: any) {
        let errorMessage = `Failed to upsert records to table ${RECORDS_TABLE}.\n`;
        errorMessage += `Model: ${model}, Nango Connection ID: ${connectionId}.\n`;
        errorMessage += `Attempted to insert/update/delete: ${recordsWithoutDuplicates.length} records\n`;

        if ('code' in err) {
            const errorCode = (err as { code: string }).code;
            errorMessage += `Error code: ${errorCode}.\n`;
            let errorDetail = '';
            switch (errorCode) {
                case '22001': {
                    errorDetail = "String length exceeds the column's maximum length (string_data_right_truncation)";
                    break;
                }
            }
            if (errorDetail) errorMessage += `Info: ${errorDetail}.\n`;
        }

        logger.error(`${errorMessage}${err}`);

        span.setTag('error', err);
        return Err(errorMessage);
    } finally {
        span.finish();
    }
}

export async function update({
    records,
    environmentId,
    connectionId,
    model,
    merging = { strategy: 'override' }
}: {
    records: FormattedRecord[];
    connectionId: number;
    environmentId: number;
    model: string;
    merging?: MergingStrategy;
}): Promise<Result<UpsertSummary>> {
    const activeSpan = tracer.scope().active();
    const span = tracer.startSpan('nango.records.update', {
        ...(activeSpan ? { childOf: activeSpan } : {}),
        tags: { 'nango.connectionId': connectionId, 'nango.model': model }
    });
    let partition: string | undefined = undefined;

    let nextMerging = merging;
    const { records: recordsWithoutDuplicates, nonUniqueKeys } = removeDuplicateKey(records);

    try {
        if (!recordsWithoutDuplicates || recordsWithoutDuplicates.length === 0) {
            return Err(
                `There are no records to upsert because there were no records that were not duplicates to insert, but there were ${records.length} records received for the "${model}" model.`
            );
        }
        const updatedKeys: string[] = [];
        const activatedKeys: string[] = [];
        await db.transaction(async (trx) => {
            // Lock to prevent concurrent updates
            await trx.raw(`SELECT pg_advisory_xact_lock(?) as lock_records_update`, [newLockId(connectionId, model)]);
            let deltaSizeInBytes = 0;
            for (let i = 0; i < recordsWithoutDuplicates.length; i += BATCH_SIZE) {
                const chunk = recordsWithoutDuplicates.slice(i, i + BATCH_SIZE);

                const oldRecords = await getRecordsToUpdate({ records: chunk, connectionId, model, trx });

                const recordsToUpdate: FormattedRecord[] = [];
                for (const oldRecord of oldRecords) {
                    const oldRecordData = await decryptRecordData(oldRecord);

                    const inputRecord = chunk.find((record) => record.external_id === oldRecord.external_id);
                    if (!inputRecord) {
                        continue;
                    }

                    const { json, ...newRecordRest } = inputRecord;
                    const newRecordData = await decryptRecordData(inputRecord);

                    const newRecord: FormattedRecord = {
                        ...newRecordRest,
                        json: deepMergeRecordData(oldRecordData, newRecordData),
                        updated_at: new Date()
                    };
                    recordsToUpdate.push(newRecord);
                }
                if (recordsToUpdate.length > 0) {
                    const encryptedRecords = encryptRecords(recordsToUpdate);
                    const query = trx
                        .with('existing', (qb) => {
                            qb.select('external_id', 'id', trx.raw('pg_column_size(json) as previous_size_bytes'), trx.raw('tableoid::regclass as partition'))
                                .from(RECORDS_TABLE)
                                .where({
                                    connection_id: connectionId,
                                    model
                                })
                                .whereIn(
                                    'external_id',
                                    encryptedRecords.map((r) => r.external_id)
                                );
                        })
                        .with('upsert', (qb) => {
                            qb.from<{ external_id: string; id: string; last_modified_at: string }>(RECORDS_TABLE)
                                .insert(encryptedRecords)
                                .returning([
                                    'external_id',
                                    'id',
                                    'updated_at',
                                    trx.raw('pg_column_size(json) as size_bytes'),
                                    trx.raw('tableoid::regclass as partition')
                                ])
                                .onConflict(['connection_id', 'external_id', 'model'])
                                .merge();
                            if (merging.strategy === 'ignore_if_modified_after_cursor' && merging.cursor) {
                                const cursor = Cursor.from(merging.cursor);
                                if (cursor) {
                                    qb.whereRaw(`(${RECORDS_TABLE}.updated_at, ${RECORDS_TABLE}.id) <= (?, ?)`, [cursor.sort, cursor.id]);
                                }
                            }
                        })
                        .select<
                            {
                                partition: string;
                                external_id: string;
                                id: string;
                                last_modified_at: string;
                                previous_size_bytes: number;
                                size_bytes: number;
                            }[]
                        >(
                            trx.raw(`
                                coalesce(upsert.partition, existing.partition) as partition,
                                upsert.id as id,
                                upsert.external_id as external_id,
                                to_json(upsert.updated_at) as last_modified_at,
                                existing.previous_size_bytes as previous_size_bytes,
                                upsert.size_bytes as size_bytes`)
                        )
                        .from('upsert')
                        .join('existing', 'upsert.external_id', 'existing.external_id')
                        .orderBy([
                            { column: 'updated_at', order: 'asc' },
                            { column: 'id', order: 'asc' }
                        ]);
                    const updated = await query;
                    updatedKeys.push(...updated.map((record) => record.external_id));

                    for (const record of updated) {
                        const oldRecord = oldRecords.find((old) => old.external_id === record.external_id);
                        if (!oldRecord?.updated_at) {
                            continue;
                        }
                        if (isInactiveThisMonth({ last_modified_at: record.last_modified_at, previous_last_modified_at: oldRecord.updated_at })) {
                            activatedKeys.push(record.external_id);
                        }
                    }

                    const lastRecord = updated[updated.length - 1];
                    if (merging.strategy === 'ignore_if_modified_after_cursor' && lastRecord) {
                        nextMerging = {
                            strategy: merging.strategy,
                            cursor: Cursor.new(lastRecord)
                        };
                    }
                    deltaSizeInBytes += updated.reduce((acc, r) => acc + (r.size_bytes - (r.previous_size_bytes || 0)), 0);
                    // all records for the same connection/model are in the same partition
                    if (!partition && updated[0]?.partition) {
                        partition = updated[0].partition;
                    }
                }
            }
            await incrCount(trx, {
                connectionId,
                environmentId,
                model,
                delta: 0,
                deltaSizeInBytes
            });
        });
        if (partition) {
            span.setTag('nango.partition', partition);
        }
        return Ok({
            addedKeys: [],
            updatedKeys,
            deletedKeys: [],
            activatedKeys,
            nonUniqueKeys,
            nextMerging,
            unchangedKeys: []
        });
    } catch (err: any) {
        let errorMessage = `Failed to update records to table ${RECORDS_TABLE}.\n`;
        errorMessage += `Model: ${model}, Nango Connection ID: ${connectionId}.\n`;
        errorMessage += `Attempted to update: ${recordsWithoutDuplicates.length} records\n`;

        if ('code' in err) errorMessage += `Error code: ${(err as { code: string }).code}.\n`;
        if ('detail' in err) errorMessage += `Detail: ${(err as { detail: string }).detail}.\n`;
        if ('message' in err) errorMessage += `Error Message: ${(err as { message: string }).message}`;

        span.setTag('error', err);
        return Err(errorMessage);
    } finally {
        span.finish();
    }
}

/**
 * deleteRecords
 * @desc Deletes records for a given connection and model up to a specified cursor and/or limit (whatever comes first).
 * Deletes all records if neither limit nor toCursorIncluded is provided.
 * @param environmentId - The id of the environment.
 * @param connectionId - The id of the connection.
 * @param model - The model name.
 * @param mode - The deletion mode: 'hard' (permanent deletion), 'soft' (empty payload and set deleted_at) or 'prune' (empty payload only).
 * @param limit - The maximum number of records to delete.
 * @param toCursorIncluded - The cursor up to which records should be deleted (inclusive. ordered by updated_at, id).
 * @param batchSize - The number of records to delete in each batch (default is 1000).
 * @param dryRun - If true, simulates the deletion without actually deleting any records (default is false).
 */
export async function deleteRecords({
    connectionId,
    environmentId,
    model,
    mode,
    limit,
    toCursorIncluded,
    batchSize = 1000,
    dryRun = false
}: {
    connectionId: number;
    environmentId: number;
    model: string;
    mode: 'hard' | 'soft' | 'prune';
    limit?: number;
    toCursorIncluded?: string;
    batchSize?: number;
    dryRun?: boolean;
}): Promise<Result<{ count: number; lastCursor: string | null }>> {
    const activeSpan = tracer.scope().active();
    const span = tracer.startSpan('nango.records.deletedRecords', {
        ...(activeSpan ? { childOf: activeSpan } : {}),
        tags: {
            'nango.environmentId': environmentId,
            'nango.connectionId': connectionId,
            'nango.model': model,
            'nango.deletionMode': mode,
            'nango.dryRun': dryRun
        }
    });

    let partition: string | undefined = undefined;
    let totalRecords = 0;
    let totalSizeInBytes = 0;
    let paginatedRecords = 0;
    let lastCursor: string | null = null;

    try {
        if (limit !== undefined && limit <= 0) {
            return Err(new Error('limit must be greater than 0'));
        }

        let decodedCursor: { sort: string; id: string } | null = null;
        if (toCursorIncluded) {
            decodedCursor = Cursor.from(toCursorIncluded) || null;
            if (!decodedCursor) {
                return Err(new Error('invalid_cursor_value'));
            }
        }

        await db.transaction(async (trx) => {
            const now = trx.fn.now(6);
            // Lock to prevent concurrent deletions (skip lock if dry run)
            if (!dryRun) {
                await trx.raw(`SELECT pg_advisory_xact_lock(?) as lock_records_delete`, [newLockId(connectionId, model)]);
            }

            do {
                const toDelete = limit ? Math.min(batchSize, limit - totalRecords) : batchSize;
                if (toDelete <= 0) {
                    break;
                }
                // if hard mode, we permanently delete the records
                // if soft mode, we update the deleted_at/updated_at fields
                // if prune mode, we empty the record payload
                const query = trx
                    .from(RECORDS_TABLE)
                    .where({ connection_id: connectionId, model })
                    .whereIn('id', function (sub) {
                        const subQuery = sub
                            .select('id')
                            .from(RECORDS_TABLE)
                            .where({ connection_id: connectionId, model })
                            .orderBy([
                                { column: 'updated_at', order: 'asc' },
                                { column: 'id', order: 'asc' }
                            ])
                            .limit(toDelete);
                        if (decodedCursor) {
                            // Delete records up to and including the cursor position
                            subQuery.whereRaw('(updated_at, id) <= (?, ?)', [decodedCursor.sort, decodedCursor.id]);
                        }
                        if (mode === 'soft') {
                            // only soft delete non-deleted records
                            subQuery.whereNull('deleted_at');
                        } else if (mode === 'prune') {
                            // only prune non-pruned records
                            subQuery.whereNull('pruned_at');
                        }
                    })
                    .returning<{ id: string; size_bytes: number; partition: string; updated_at: string }[]>([
                        'id',
                        trx.raw('pg_column_size(json) as size_bytes'),
                        trx.raw('tableoid::regclass as partition'),
                        trx.raw('to_json(updated_at) as updated_at')
                    ]);

                if (!dryRun) {
                    switch (mode) {
                        case 'prune':
                            query.update({
                                pruned_at: now,
                                json: {} // empty the record payload
                                // IMPORTANT: updated_at isn't updated because it would cause the record cursor to also change
                            });
                            break;
                        case 'soft':
                            query.update({
                                deleted_at: now,
                                updated_at: now
                            });
                            break;
                        case 'hard':
                            query.del();
                            break;
                    }
                }

                const res = await query;

                paginatedRecords = res.length;
                totalRecords += paginatedRecords;
                totalSizeInBytes += res.reduce((acc, r) => acc + r.size_bytes, 0);
                if (!partition && res[0]?.partition) {
                    partition = res[0].partition;
                }

                const lastDeletedRecord = res[res.length - 1];
                if (lastDeletedRecord) {
                    lastCursor = Cursor.new({ id: lastDeletedRecord.id, last_modified_at: lastDeletedRecord.updated_at });
                }

                // break if the returned page is not full
                if (paginatedRecords < toDelete) {
                    break;
                }
            } while (paginatedRecords > 0);

            // Update counts
            if (!dryRun) {
                const delta = mode === 'prune' ? 0 : -totalRecords; // pruning doesn't affect the records count
                const newCount = await incrCount(trx, {
                    environmentId,
                    connectionId,
                    model,
                    delta,
                    deltaSizeInBytes: -totalSizeInBytes
                });

                // If all records are deleted, clean up the count entry
                if (newCount?.count === 0) {
                    await deleteCount(trx, {
                        environmentId,
                        connectionId,
                        model
                    });
                }
            }
        });

        if (partition) {
            span.setTag('nango.partition', partition);
        }

        return Ok({ count: totalRecords, lastCursor });
    } catch (err) {
        span.setTag('error', err);
        return Err(new Error(`Failed to delete records connection ${connectionId}, model ${model}`, { cause: err }));
    } finally {
        span.finish();
    }
}

// Mark all non-deleted records from previous generations as deleted
// returns the ids of records being deleted
export async function deleteOutdatedRecords({
    environmentId,
    connectionId,
    model,
    generation,
    batchSize = 5000
}: {
    environmentId: number;
    connectionId: number;
    model: string;
    generation: number;
    batchSize?: number;
}): Promise<Result<string[]>> {
    const activeSpan = tracer.scope().active();
    const span = tracer.startSpan('nango.records.deleteOutdatedRecords', {
        ...(activeSpan ? { childOf: activeSpan } : {}),
        tags: { 'nango.connectionId': connectionId, 'nango.model': model }
    });
    let partition: string | undefined = undefined;
    try {
        const now = db.fn.now(6);
        return await db.transaction(async (trx) => {
            const deletedIds: string[] = [];
            let hasMore = true;
            while (hasMore) {
                const res: { external_id: string; size_bytes: number; partition: string }[] = await trx
                    .from<FormattedRecord>(RECORDS_TABLE)
                    .whereIn('id', function (sub) {
                        sub.select('id')
                            .from(RECORDS_TABLE)
                            .where({
                                connection_id: connectionId,
                                model,
                                deleted_at: null
                                // NOTE: not emptying the record payload so we don't introduce a breaking change
                            })
                            .where('sync_job_id', '<', generation)
                            .limit(batchSize);
                    })
                    .update({
                        deleted_at: now,
                        updated_at: now,
                        sync_job_id: generation
                    })
                    // records table is partitioned by connection_id and model
                    // to avoid table scan, we must always filter by connection_id and model
                    .where({
                        connection_id: connectionId,
                        model
                    })
                    .returning(['external_id', trx.raw('pg_column_size(json) as size_bytes'), trx.raw('tableoid::regclass as partition')]);

                if (res.length < batchSize) {
                    hasMore = false;
                }

                if (!partition && res[0]?.partition) {
                    partition = res[0].partition;
                }

                deletedIds.push(...res.map((r) => r.external_id));

                // update records count and size
                const deleted = res.length;
                const sizeInBytes = res.reduce((acc, r) => acc + r.size_bytes, 0);
                if (deleted > 0) {
                    await incrCount(trx, {
                        connectionId,
                        environmentId,
                        model,
                        delta: -deleted,
                        deltaSizeInBytes: -sizeInBytes
                    });
                }
            }

            if (partition) {
                span.setTag('nango.partition', partition);
            }
            return Ok(deletedIds);
        });
    } catch (err) {
        const e = new Error(`Failed to mark previous generation records as deleted for connection ${connectionId}, model ${model}, generation ${generation}`, {
            cause: err
        });
        span.setTag('error', err);
        return Err(e);
    } finally {
        span.finish();
    }
}

export async function getCountsByModel({
    connectionId,
    environmentId
}: {
    connectionId: number;
    environmentId: number;
}): Promise<Result<Record<string, RecordCount>>> {
    try {
        const results = await db
            .from(RECORD_COUNTS_TABLE)
            .where({
                connection_id: connectionId,
                environment_id: environmentId
            })
            .select<RecordCount[]>('*');

        const statsByModel: Record<string, RecordCount> = results.reduce(
            (acc, result) => ({
                ...acc,
                [result.model]: {
                    ...result,
                    size_bytes: Number(result.size_bytes) // bigint is returned as string by pg
                }
            }),
            {}
        );
        return Ok(statsByModel);
    } catch {
        const e = new Error(`Failed to fetch stats for connection ${connectionId} and environment ${environmentId}`);
        return Err(e);
    }
}

export async function* paginateCounts({
    environmentIds,
    batchSize = 1000
}: {
    environmentIds?: number[];
    batchSize?: number;
} = {}): AsyncGenerator<Result<RecordCount[]>> {
    if (batchSize < 1) {
        throw new RangeError(`batchSize must be > 0`);
    }
    let offset = 0;
    try {
        while (true) {
            // TODO: optimize with cursor pagination
            let query = db<RecordCount>(RECORD_COUNTS_TABLE).select('*').orderBy(['connection_id', 'model']).limit(batchSize).offset(offset);

            if (environmentIds && environmentIds.length > 0) {
                query = query.whereIn('environment_id', environmentIds);
            }

            const results = await query;
            if (results.length < batchSize) {
                return yield Ok(results);
            }

            yield Ok(results);
            offset += results.length;
        }
    } catch (err) {
        return yield Err(`Failed to fetch record counts: ${String(err)}`);
    }
}

export async function incrCount(
    trx: Knex,
    {
        connectionId,
        environmentId,
        model,
        delta,
        deltaSizeInBytes
    }: {
        connectionId: number;
        environmentId: number;
        model: string;
        delta: number;
        deltaSizeInBytes: number;
    }
): Promise<RecordCount> {
    const res = await trx
        .from<RecordCount>(RECORD_COUNTS_TABLE)
        .insert({
            connection_id: connectionId,
            model,
            environment_id: environmentId,
            count: delta,
            size_bytes: deltaSizeInBytes
        })
        .onConflict(['connection_id', 'environment_id', 'model'])
        .merge({
            count: trx.raw(`GREATEST(0, ${RECORD_COUNTS_TABLE}.count + EXCLUDED.count)`),
            size_bytes: trx.raw(`GREATEST(0, ${RECORD_COUNTS_TABLE}.size_bytes + EXCLUDED.size_bytes)`),
            updated_at: trx.fn.now(6)
        })
        .returning('*');

    const [updated] = res;
    if (!updated) {
        throw new Error('Failed to update record count');
    }
    return {
        ...updated,
        size_bytes: Number(updated.size_bytes)
    };
}

export async function deleteCount(
    trx: Knex,
    {
        connectionId,
        environmentId,
        model
    }: {
        connectionId: number;
        environmentId: number;
        model: string;
    }
): Promise<void> {
    await trx.from(RECORD_COUNTS_TABLE).where({ connection_id: connectionId, environment_id: environmentId, model }).del();
}

function getPgErrorCode(err: unknown): string | undefined {
    if (err && typeof err === 'object') {
        const code = (err as { code?: unknown }).code;
        if (typeof code === 'string') {
            return code;
        }
        if ('cause' in err) {
            return getPgErrorCode((err as { cause?: unknown }).cause);
        }
    }
    return undefined;
}

function isMissingTableError(err: unknown): boolean {
    const code = getPgErrorCode(err);
    return code === '42P01' || code === '3F000';
}

/*
 * autoPruningCandidate
 * @desc finds a candidate connection/model for auto-pruning
 * This function helps distribute the pruning load across partitions
 * by randomly selecting a partition to search for stale records.
 * @param staleAfterMs - milliseconds since last modification to consider a record stale
 * @returns a Result containing either:
 * - candidate connection and model with a cursor to the stale record
 * - null if no candidate found
 */
export async function autoPruningCandidate({ staleAfterMs }: { staleAfterMs: number }): Promise<
    Result<{
        partition: number;
        environmentId: number;
        connectionId: number;
        model: string;
        cursor: string;
    } | null>
> {
    const partition = Math.floor(Math.random() * 256);
    const table = `${RECORDS_TABLE}_p${partition}`;
    try {
        const [candidate] = await db
            .from(table)
            .select<{ id: string; environment_id: number | null; connection_id: number; model: string; last_modified_at: string }[]>(
                db.raw(`
                    ${table}.id,
                    ${table}.connection_id,
                    ${table}.model,
                    record_counts.environment_id,
                    to_json(${table}.updated_at) as last_modified_at
                `)
            )
            .leftJoin('record_counts', function () {
                this.on(`${table}.connection_id`, 'record_counts.connection_id').andOn(`${table}.model`, 'record_counts.model');
            })
            .whereNull(`${table}.pruned_at`)
            .whereRaw(`${table}.updated_at < NOW() - INTERVAL '${staleAfterMs} milliseconds'`)
            .limit(1);
        if (candidate) {
            if (candidate.environment_id === null) {
                return Err(
                    new Error(`Missing record_counts entry for connection_id=${candidate.connection_id} model=${candidate.model} in partition ${partition}`)
                );
            }
            return Ok({
                partition,
                environmentId: candidate.environment_id,
                connectionId: candidate.connection_id,
                model: candidate.model,
                cursor: Cursor.new(candidate)
            });
        }
        return Ok(null);
    } catch (err) {
        if (isMissingTableError(err)) {
            return Ok(null);
        }
        return Err(new Error(`Failed to find auto-pruning candidate in partition ${partition}`, { cause: err }));
    }
}

/*
 * autoDeletingCandidate
 * @desc finds a candidate connection/model for auto-deleting
 * by randomly selecting a connection/model that have NOT seen its count updated in the past staleAfterMs milliseconds.
 * @param staleAfterMs - milliseconds since last modification to consider a connection as potentially stale
 * @returns a Result containing either:
 * - candidate connection, model and environmentId
 * - null if no candidate found
 */
export async function autoDeletingCandidate({ staleAfterMs }: { staleAfterMs: number }): Promise<
    Result<{
        connectionId: number;
        model: string;
        environmentId: number;
    } | null>
> {
    try {
        const [candidate] = await db
            .from(RECORD_COUNTS_TABLE)
            .select<RecordCount[]>('*')
            .whereRaw(`updated_at < NOW() - INTERVAL '${staleAfterMs} milliseconds'`)
            .where('count', '>', 0)
            .orderByRaw('RANDOM()')
            .limit(1);

        if (candidate) {
            return Ok({
                connectionId: candidate.connection_id,
                model: candidate.model,
                environmentId: candidate.environment_id
            });
        }
        return Ok(null);
    } catch (err) {
        if (isMissingTableError(err)) {
            return Ok(null);
        }
        return Err(new Error(`Failed to find auto-delete candidate`, { cause: err }));
    }
}

/**
 * getRecordsToUpdate
 * @desc returns records that exist in the records table but have a different data_hash
 */
async function getRecordsToUpdate({
    records,
    connectionId,
    model,
    trx
}: {
    records: FormattedRecord[];
    connectionId: number;
    model: string;
    trx: Knex.Transaction;
}): Promise<FormattedRecord[]> {
    const keys: string[] = records.map((record: FormattedRecord) => getUniqueId(record));
    const keysWithHash: [string, string][] = records.map((record: FormattedRecord) => [getUniqueId(record), record.data_hash]);

    return trx
        .select<FormattedRecord[]>('*')
        .from(RECORDS_TABLE)
        .where({
            connection_id: connectionId,
            model
        })
        .whereNull('deleted_at') // only non-deleted records can be updated
        .whereIn('external_id', keys)
        .whereNotIn(['external_id', 'data_hash'], keysWithHash);
}

function newLockId(connectionId: number, model: string): bigint {
    // convert modelHash to unsigned 32-bit integer to ensure
    // negative hash values don't cause sign extension problems
    // when combined with connectionId in the bitwise OR operation
    const modelHash = stringToHash(model) >>> 0;

    return (BigInt(connectionId) << 32n) | BigInt(modelHash);
}
