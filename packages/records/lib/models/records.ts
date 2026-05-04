import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import tracer from 'dd-trace';

import { Err, Ok, retry, stringToHash } from '@nangohq/utils';

import { RECORDS_DATA_TABLE, RECORDS_TABLE, RECORD_COUNTS_TABLE } from '../constants.js';
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

class LockError extends Error {}

async function acquireAdvisoryLock(trx: Knex.Transaction, { name, connectionId, model }: { name: string; connectionId: number; model: string }): Promise<void> {
    try {
        await trx.raw(`SELECT pg_advisory_xact_lock(?) as ${name}`, [newLockId(connectionId, model)]);
    } catch {
        throw new LockError(`Failed to acquire lock for model ${model} (connection ${connectionId}). Another operation may be in progress. Please retry.`);
    }
}

interface UpsertedMetadata {
    partition: string;
    external_id: string;
    id: string;
    last_modified_at: string;
    previous_last_modified_at: string | null;
    needs_data_write: boolean;
    legacy_size_bytes: number;
    status: 'inserted' | 'changed' | 'undeleted' | 'deleted' | 'unchanged';
}

function isInactiveThisMonth(record: { last_modified_at: string | Date; previous_last_modified_at: string | Date }): boolean {
    const firstDayOfMonth = dayjs().utc().startOf('month');
    const previousLastModifiedAt = dayjs(record.previous_last_modified_at).utc();
    return previousLastModifiedAt.isBefore(firstDayOfMonth);
}

function getInactiveThisMonth(records: UpsertedMetadata[]): UpsertedMetadata[] {
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
            .where({ connection_id: connectionId, model })
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
            query = query.whereRaw(`(updated_at, id) > (?, ?)`, [decodedCursor.sort, decodedCursor.id]);
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

        const recordsMetadata: FormattedRecordWithMetadata[] = await query.select(
            // PostgreSQL stores timestamp with microseconds precision
            // however, javascript date only supports milliseconds precision
            // we therefore convert timestamp to string (using to_json()) in order to avoid precision loss
            dbRead.raw(`
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

        if (recordsMetadata.length === 0) {
            return Ok({ records: [], next_cursor: null });
        }

        const recordIds = recordsMetadata.map((r) => r.id);
        const recordsData = await dbRead
            .from(RECORDS_DATA_TABLE)
            .where({ connection_id: connectionId, model })
            .whereIn('id', recordIds)
            .select<{ id: string; data: FormattedRecord['json'] }[]>('id', 'data');
        const dataById = new Map(recordsData.map((r) => [r.id, r.data]));

        const results: ReturnedRecord[] = [];

        // TODO: decrypt in batch
        for (const item of recordsMetadata) {
            const data = dataById.get(item.id) ?? item.json ?? {};
            const decryptedData = await decryptRecordData({ ...item, json: data });
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
        const partition = recordsMetadata[0]?.partition;
        if (span && partition) {
            span.setTag('nango.partition', partition);
        }

        if (results.length > Number(limit || 100)) {
            results.pop();
            recordsMetadata.pop();

            const cursorRawElement = recordsMetadata[recordsMetadata.length - 1];
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
                    await acquireAdvisoryLock(trx, { name: `lock_records_${softDelete ? 'delete' : 'upsert'}`, connectionId, model });

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

                        const upsertMetadata = await trx
                            .with(
                                'incoming',
                                trx.raw(
                                    `SELECT * FROM (VALUES ${chunk.map(() => '(?, ?)').join(', ')}) AS t(external_id, data_hash)`,
                                    chunk.flatMap((r) => [r.external_id, r.data_hash])
                                )
                            )
                            .with('existing', (qb) => {
                                qb.select(
                                    `${RECORDS_TABLE}.id`,
                                    `${RECORDS_TABLE}.external_id`,
                                    `${RECORDS_TABLE}.deleted_at`,
                                    `${RECORDS_TABLE}.updated_at`,
                                    trx.raw(`incoming.data_hash IS DISTINCT FROM ${RECORDS_TABLE}.data_hash as has_changed`),
                                    trx.raw(`(${RECORDS_TABLE}.json IS NOT NULL OR ${RECORDS_TABLE}.pruned_at IS NOT NULL) as must_upsert_data`),
                                    trx.raw(`COALESCE(pg_column_size(${RECORDS_TABLE}.json), 0) as legacy_size_bytes`)
                                )
                                    .from(RECORDS_TABLE)
                                    .where(`${RECORDS_TABLE}.connection_id`, '=', connectionId)
                                    .where(`${RECORDS_TABLE}.model`, '=', model)
                                    .join('incoming', 'incoming.external_id', `${RECORDS_TABLE}.external_id`);
                            })
                            .with('upsert', (qb) => {
                                qb.insert(
                                    chunk.map((r) => ({
                                        connection_id: r.connection_id,
                                        model: r.model,
                                        id: r.id,
                                        external_id: r.external_id,
                                        json: trx.raw(`NULL`), // record data is now stored in a separate table
                                        data_hash: r.data_hash,
                                        sync_id: r.sync_id,
                                        sync_job_id: r.sync_job_id,
                                        deleted_at: r.deleted_at,
                                        pruned_at: null, // clear pruned_at when record is re-upserted
                                        ...(r.updated_at ? { updated_at: r.updated_at } : {})
                                    }))
                                )
                                    .into(RECORDS_TABLE)
                                    .onConflict(['connection_id', 'model', 'external_id'])
                                    .merge()
                                    .returning(['id', 'external_id', 'deleted_at', 'updated_at', trx.raw('tableoid::regclass as partition')]);
                                if (merging.strategy === 'ignore_if_modified_after_cursor' && merging.cursor) {
                                    const cursor = Cursor.from(merging.cursor);
                                    if (cursor) {
                                        qb.whereRaw(`(${RECORDS_TABLE}.updated_at, ${RECORDS_TABLE}.id) <= (?, ?)`, [cursor.sort, cursor.id]);
                                    }
                                }
                            })
                            .select<UpsertedMetadata[]>(
                                trx.raw(`
                                    upsert.partition as partition,
                                    upsert.id as id,
                                    upsert.external_id as external_id,
                                    to_json(upsert.updated_at) as last_modified_at,
                                    COALESCE(existing.has_changed OR existing.must_upsert_data, true) as needs_data_write,
                                    COALESCE(existing.legacy_size_bytes, 0) as legacy_size_bytes,
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
                                                WHEN existing.has_changed THEN 'changed'
                                                ELSE 'unchanged'
                                            END
                                    END as status`)
                            )
                            .from('upsert')
                            .leftJoin('existing', 'existing.external_id', 'upsert.external_id')
                            .orderBy([
                                { column: 'upsert.updated_at', order: 'asc' },
                                { column: 'upsert.id', order: 'asc' }
                            ]);

                        // Upsert data for:
                        // - changed/new records (has_changed)
                        // - records whose payload is still in records.json (legacy migration)
                        // - records whose payload was pruned and is being restored (pruned_at IS NOT NULL)
                        const needsDataWriteIds = new Set(upsertMetadata.filter((r) => r.needs_data_write).map((r) => r.id));
                        const recordsToUpdateData = encryptRecords(chunk.filter((r) => needsDataWriteIds.has(r.id)));

                        let batchDeltaSizeInBytes = 0;
                        if (recordsToUpdateData.length > 0) {
                            const upsertDataResult = await trx
                                .with('prev_size', (qb) => {
                                    qb.select('id', trx.raw('pg_column_size(data) as prev_size_bytes'))
                                        .from(RECORDS_DATA_TABLE)
                                        .whereIn(
                                            ['connection_id', 'model', 'id'],
                                            recordsToUpdateData.map((r) => [r.connection_id, r.model, r.id])
                                        );
                                })
                                .with('upsert_data', (qb) => {
                                    qb.insert(
                                        recordsToUpdateData.map((r) => ({
                                            id: r.id,
                                            connection_id: r.connection_id,
                                            model: r.model,
                                            data: r.json
                                        }))
                                    )
                                        .into(RECORDS_DATA_TABLE)
                                        .onConflict(['connection_id', 'model', 'id'])
                                        .merge(['data'])
                                        .returning<{ id: string; new_size_bytes: number }[]>(['id', trx.raw('pg_column_size(data) as new_size_bytes')]);
                                })
                                .select<{ id: string; new_size_bytes: number; prev_size_bytes: number }[]>(
                                    'upsert_data.id',
                                    'upsert_data.new_size_bytes',
                                    trx.raw('COALESCE(prev_size.prev_size_bytes, 0) as prev_size_bytes')
                                )
                                .from('upsert_data')
                                .leftJoin('prev_size', 'prev_size.id', 'upsert_data.id');

                            // Calculate the delta size
                            const totalLegacySizeInBytes = upsertMetadata.reduce((acc, r) => {
                                if (r.needs_data_write) {
                                    return acc + r.legacy_size_bytes;
                                }
                                return acc;
                            }, 0);
                            batchDeltaSizeInBytes = upsertDataResult.reduce((acc, r) => acc + r.new_size_bytes - r.prev_size_bytes, -totalLegacySizeInBytes);
                        }

                        // Billing:
                        // A record is billed only once per month. ie:
                        // - If a record is inserted, it is billed
                        // - If a record is updated, it is billed if it has not been billed yet during the current month
                        // - If a record is undeleted, it is not billed
                        // - If a record is deleted, it is not billed

                        if (softDelete) {
                            const deleted = upsertMetadata.filter((r) => r.status === 'deleted');
                            summary.deletedKeys?.push(...deleted.map((r) => r.external_id));
                        } else {
                            const undeletedRes = upsertMetadata.filter((r) => r.status === 'undeleted');
                            const changedRes = upsertMetadata.filter((r) => r.status === 'changed');

                            const insertedKeys = upsertMetadata.filter((r) => r.status === 'inserted').map((r) => r.external_id);
                            const undeletedKeys = undeletedRes.map((r) => r.external_id);
                            const addedKeys = insertedKeys.concat(undeletedKeys);
                            const updatedKeys = changedRes.map((r) => r.external_id);
                            const activatedKeys = [...insertedKeys, ...getInactiveThisMonth(changedRes).map((r) => r.external_id)];

                            summary.addedKeys.push(...addedKeys);
                            summary.updatedKeys.push(...updatedKeys);
                            summary.activatedKeys.push(...activatedKeys);
                            summary.unchangedKeys.push(...upsertMetadata.filter((r) => r.status === 'unchanged').map((r) => r.external_id));
                        }

                        if (merging.strategy === 'ignore_if_modified_after_cursor') {
                            // Next cursor is the last MODIFIED record
                            const getLastModifiedRecord = (records: UpsertedMetadata[]): UpsertedMetadata | undefined => {
                                for (let i = records.length - 1; i >= 0; i--) {
                                    if (records[i]?.status !== 'unchanged') {
                                        return records[i];
                                    }
                                }
                                return undefined;
                            };
                            const lastRecord = getLastModifiedRecord(upsertMetadata);
                            if (lastRecord) {
                                summary.nextMerging = {
                                    strategy: merging.strategy,
                                    cursor: Cursor.new(lastRecord)
                                };
                            }
                        }
                        deltaSizeInBytes += batchDeltaSizeInBytes;

                        // all records for the same connection/model are in the same partition
                        if (!partition && upsertMetadata[0]?.partition) {
                            partition = upsertMetadata[0].partition;
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
        if (err instanceof LockError) {
            span.setTag('error', err);
            return Err(err);
        }
        let errorMessage = `Failed to upsert ${recordsWithoutDuplicates.length} records. (connectionId: ${connectionId}, model: ${model})\n`;

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
            await acquireAdvisoryLock(trx, { name: 'lock_records_update', connectionId, model });

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
                            qb.select(
                                `${RECORDS_TABLE}.external_id`,
                                `${RECORDS_TABLE}.id`,
                                trx.raw(`pg_column_size(${RECORDS_TABLE}.json) as legacy_size_bytes`),
                                trx.raw(`${RECORDS_TABLE}.tableoid::regclass as partition`)
                            )
                                .from(RECORDS_TABLE)
                                .where(`${RECORDS_TABLE}.connection_id`, connectionId)
                                .where(`${RECORDS_TABLE}.model`, model)
                                .whereIn(
                                    `${RECORDS_TABLE}.external_id`,
                                    encryptedRecords.map((r) => r.external_id)
                                );
                        })
                        .with('upsert_metadata', (qb) => {
                            qb.from<{ external_id: string; id: string; last_modified_at: string }>(RECORDS_TABLE)
                                .insert(
                                    encryptedRecords.map((r) => ({
                                        connection_id: r.connection_id,
                                        model: r.model,
                                        id: r.id,
                                        external_id: r.external_id,
                                        json: trx.raw('NULL'),
                                        data_hash: r.data_hash,
                                        sync_id: r.sync_id,
                                        sync_job_id: r.sync_job_id,
                                        pruned_at: null, // clear pruned_at when record is updated
                                        updated_at: r.updated_at
                                    }))
                                )
                                .returning(['external_id', 'id', 'updated_at', trx.raw('tableoid::regclass as partition')])
                                .onConflict(['connection_id', 'model', 'external_id'])
                                .merge();
                            if (merging.strategy === 'ignore_if_modified_after_cursor' && merging.cursor) {
                                const cursor = Cursor.from(merging.cursor);
                                if (cursor) {
                                    qb.whereRaw(`(${RECORDS_TABLE}.updated_at, ${RECORDS_TABLE}.id) <= (?, ?)`, [cursor.sort, cursor.id]);
                                }
                            }
                        })
                        .with('previous_size', (qb) => {
                            qb.select(`${RECORDS_DATA_TABLE}.id`, trx.raw(`pg_column_size(${RECORDS_DATA_TABLE}.data) as previous_size_bytes`))
                                .from(RECORDS_DATA_TABLE)
                                .join('existing', (join) => {
                                    join.on('existing.id', '=', `${RECORDS_DATA_TABLE}.id`)
                                        .andOnVal(`${RECORDS_DATA_TABLE}.connection_id`, '=', connectionId)
                                        .andOnVal(`${RECORDS_DATA_TABLE}.model`, '=', model);
                                });
                        })
                        .with('upsert_data', (qb) => {
                            qb.insert(
                                trx.raw(
                                    `SELECT upsert_metadata.id, v.connection_id, v.model, v.data
                                    FROM upsert_metadata
                                    JOIN (VALUES ${encryptedRecords.map(() => '(?::uuid, ?::integer, ?::text, ?::jsonb)').join(', ')}) AS v(id, connection_id, model, data) ON v.id = upsert_metadata.id`,
                                    encryptedRecords.flatMap((r) => [r.id, r.connection_id, r.model, r.json])
                                )
                            )
                                .into(RECORDS_DATA_TABLE)
                                .onConflict(['connection_id', 'model', 'id'])
                                .merge(['data'])
                                .returning(['id', trx.raw('pg_column_size(data) as new_size_bytes')]);
                        })
                        .select<
                            {
                                partition: string;
                                external_id: string;
                                id: string;
                                last_modified_at: string;
                                delta_size_bytes: number;
                            }[]
                        >(
                            trx.raw(`
                                upsert_metadata.partition as partition,
                                upsert_metadata.id as id,
                                upsert_metadata.external_id as external_id,
                                to_json(upsert_metadata.updated_at) as last_modified_at,
                                upsert_data.new_size_bytes - COALESCE(existing.legacy_size_bytes, 0) - COALESCE(previous_size.previous_size_bytes, 0)  as delta_size_bytes`)
                        )
                        .from('upsert_metadata')
                        .join('existing', 'existing.id', 'upsert_metadata.id')
                        .join('upsert_data', 'upsert_data.id', 'upsert_metadata.id')
                        .leftJoin('previous_size', 'previous_size.id', 'upsert_metadata.id')
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
                    deltaSizeInBytes += updated.reduce((acc, r) => acc + r.delta_size_bytes, 0);
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
        if (err instanceof LockError) {
            span.setTag('error', err);
            return Err(err);
        }
        let errorMessage = `Failed to update ${recordsWithoutDuplicates.length} records. (connectionId: ${connectionId}, model: ${model})\n`;

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
                await acquireAdvisoryLock(trx, { name: 'lock_records_delete', connectionId, model });
            }

            do {
                const toDelete = limit ? Math.min(batchSize, limit - totalRecords) : batchSize;
                if (toDelete <= 0) {
                    break;
                }

                const targetIdsSubquery = () => {
                    const subQuery = trx
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
                    return subQuery;
                };

                // Fetch the size of records before deletion
                let sizeRows: { id: string; size_bytes: number }[] = [];
                if (!dryRun) {
                    sizeRows = await trx
                        .select<{ id: string; size_bytes: number }[]>(
                            'r.id',
                            trx.raw('COALESCE(pg_column_size(r.json), pg_column_size(d.data), 0) as size_bytes')
                        )
                        .from({ r: RECORDS_TABLE })
                        .leftJoin({ d: RECORDS_DATA_TABLE }, function () {
                            this.on('d.connection_id', 'r.connection_id').andOn('d.model', 'r.model').andOn('d.id', 'r.id');
                        })
                        .where('r.connection_id', connectionId)
                        .andWhere('r.model', model)
                        .whereIn('r.id', targetIdsSubquery());
                }

                // if hard mode, we permanently delete the records
                // if prune mode, we empty the record payload
                // if soft mode, we update the deleted_at/updated_at fields
                const query = trx
                    .from(RECORDS_TABLE)
                    .where({ connection_id: connectionId, model })
                    .whereIn('id', targetIdsSubquery())
                    .returning<{ id: string; partition: string; updated_at: string }[]>([
                        'id',
                        trx.raw('tableoid::regclass as partition'),
                        trx.raw('to_json(updated_at) as updated_at')
                    ]);

                if (!dryRun) {
                    switch (mode) {
                        case 'prune':
                            query.update({
                                pruned_at: now,
                                json: null
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
                const ids = res.map((r) => r.id);

                if (!dryRun && mode !== 'soft') {
                    await trx.from(RECORDS_DATA_TABLE).where({ connection_id: connectionId, model }).whereIn('id', ids).delete();
                }

                const sizeById = new Map(sizeRows.map((r) => [r.id, r.size_bytes]));

                paginatedRecords = res.length;
                totalRecords += paginatedRecords;
                totalSizeInBytes += ids.reduce((acc, id) => acc + (sizeById.get(id) ?? 0), 0);
                if (!partition && res[0]?.partition) {
                    partition = res[0].partition;
                }

                const lastDeletedRecord = res[res.length - 1];
                if (lastDeletedRecord) {
                    lastCursor = Cursor.new({ id: lastDeletedRecord.id, last_modified_at: lastDeletedRecord.updated_at });
                }

                if (paginatedRecords < toDelete) {
                    break;
                }
            } while (paginatedRecords > 0);

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
        if (err instanceof LockError) {
            span.setTag('error', err);
            return Err(err);
        }
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
    batchSize = 1000
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
        const deletedIds: string[] = [];
        let hasMore = true;
        // NOTE: deletion is intentionally not atomic. Each batch is its own transaction so that
        // long-running deletes (e.g. millions of records) don't hold a single DB connection and
        // row locks for the entire duration, which was causing timeouts and stalling other queries.
        // The tradeoff is that a failure mid-way leaves the dataset in a partially deleted state.
        // This is acceptable because: (1) the sync fails and the user is notified, (2) the next
        // sync run will call deleteOutdatedRecords again and clean up whatever was missed.
        while (hasMore) {
            const batchResult = await retry(
                () => {
                    return db.transaction(async (trx) => {
                        // Lock to prevent concurrent modifications with upserts and deletes
                        await acquireAdvisoryLock(trx, { name: 'lock_records_outdated', connectionId, model });

                        const res: {
                            id: string;
                            connection_id: number;
                            model: string;
                            external_id: string;
                            legacy_size_bytes: number;
                            partition: string;
                        }[] = (
                            await trx.raw(
                                `WITH to_delete AS MATERIALIZED (
                                    SELECT ctid, id
                                    FROM ${RECORDS_TABLE}
                                    WHERE connection_id = ?
                                      AND model = ?
                                      AND sync_job_id < ?
                                      AND deleted_at IS NULL
                                    LIMIT ?
                                )
                                UPDATE ${RECORDS_TABLE} r
                                SET
                                    deleted_at = current_timestamp(6),
                                    updated_at = current_timestamp(6),
                                    sync_job_id = ?
                                FROM to_delete
                                WHERE r.ctid = to_delete.ctid
                                  AND r.connection_id = ?
                                  AND r.model = ?
                                RETURNING
                                  r.id,
                                  r.connection_id,
                                  r.model,
                                  r.external_id,
                                  COALESCE(pg_column_size(r.json), 0) as legacy_size_bytes,
                                  r.tableoid::regclass as partition`,
                                [connectionId, model, generation, batchSize, generation, connectionId, model]
                            )
                        ).rows;

                        // Get size of deleted records
                        const [sizeRes] = await trx(RECORDS_DATA_TABLE)
                            .whereIn(
                                ['connection_id', 'model', 'id'],
                                res.map((r) => [r.connection_id, r.model, r.id])
                            )
                            .select<{ sum: number }[]>(trx.raw('sum(pg_column_size(data)) as sum'));
                        const totalPreviousSizeBytes = sizeRes?.sum || 0;

                        // update records count and size
                        const deleted = res.length;
                        const totalLegacySizeInBytes = res.reduce((acc, r) => acc + r.legacy_size_bytes, 0);
                        const deltaSizeInBytes = -totalLegacySizeInBytes - totalPreviousSizeBytes;
                        if (deleted > 0) {
                            await incrCount(trx, {
                                connectionId,
                                environmentId,
                                model,
                                delta: -deleted,
                                deltaSizeInBytes
                            });
                        }

                        return res;
                    });
                },
                // Retry if deadlock detected
                // https://www.postgresql.org/docs/current/mvcc-serialization-failure-handling.html
                {
                    maxAttempts: 3,
                    delayMs: 500,
                    retryOnError: (err) => {
                        if (err !== null && typeof err === 'object' && 'code' in err) {
                            const errorCode = (err as { code: string }).code;
                            return errorCode === '40P01'; // deadlock_detected
                        }
                        return false;
                    }
                }
            );

            if (batchResult.length < batchSize) {
                hasMore = false;
            }

            if (!partition && batchResult[0]?.partition) {
                partition = batchResult[0].partition;
            }

            deletedIds.push(...batchResult.map((r) => r.external_id));
        }

        if (partition) {
            span.setTag('nango.partition', partition);
        }
        return Ok(deletedIds);
    } catch (err) {
        if (err instanceof LockError) {
            span.setTag('error', err);
            return Err(err);
        }
        const e = new Error(`Failed to mark previous generation records as deleted for connection ${connectionId}, model ${model}, generation ${generation}`, {
            cause: err
        });
        span.setTag('error', e);
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
    connectionIds,
    batchSize = 1000
}: {
    connectionIds?: number[];
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

            if (connectionIds && connectionIds.length > 0) {
                query = query.whereIn('connection_id', connectionIds);
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
        .select<FormattedRecord[]>(`${RECORDS_TABLE}.*`, trx.raw(`COALESCE(${RECORDS_DATA_TABLE}.data, ${RECORDS_TABLE}.json, '{}'::jsonb) as json`))
        .from(RECORDS_TABLE)
        .leftJoin(RECORDS_DATA_TABLE, function () {
            this.on(`${RECORDS_DATA_TABLE}.connection_id`, '=', `${RECORDS_TABLE}.connection_id`)
                .andOn(`${RECORDS_DATA_TABLE}.model`, '=', `${RECORDS_TABLE}.model`)
                .andOn(`${RECORDS_DATA_TABLE}.id`, '=', `${RECORDS_TABLE}.id`);
        })
        .where(`${RECORDS_TABLE}.connection_id`, connectionId)
        .where(`${RECORDS_TABLE}.model`, model)
        .whereNull(`${RECORDS_TABLE}.deleted_at`)
        .whereIn(`${RECORDS_TABLE}.external_id`, keys)
        .whereNotIn([`${RECORDS_TABLE}.external_id`, `${RECORDS_TABLE}.data_hash`], keysWithHash);
}

export function newLockId(connectionId: number, model: string): bigint {
    // convert modelHash to unsigned 32-bit integer to ensure
    // negative hash values don't cause sign extension problems
    // when combined with connectionId in the bitwise OR operation
    const modelHash = stringToHash(model) >>> 0;

    return (BigInt(connectionId) << 32n) | BigInt(modelHash);
}
