import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import { db, dbRead } from '../db/client.js';
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
import { decryptRecordData, encryptRecords } from '../utils/encryption.js';
import { RECORDS_TABLE, RECORD_COUNTS_TABLE } from '../constants.js';
import { removeDuplicateKey, getUniqueId } from '../helpers/uniqueKey.js';
import { logger } from '../utils/logger.js';
import { Err, Ok, retry, stringToHash } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';
import { Cursor } from '../cursor.js';
import { deepMergeRecordData } from '../helpers/merge.js';
import type { MergingStrategy, CursorOffset } from '@nangohq/types';

dayjs.extend(utc);

const BATCH_SIZE = 1000;

interface UpsertResult {
    external_id: string;
    id: string;
    last_modified_at: string;
    previous_last_modified_at: string | null;
    status: 'inserted' | 'changed' | 'undeleted' | 'deleted' | 'unchanged';
}

function isBillable(record: { last_modified_at: string | Date; previous_last_modified_at: string | Date }): boolean {
    const firstDayOfMonth = dayjs().utc().startOf('month');
    const previousLastModifiedAt = dayjs(record.previous_last_modified_at).utc();
    return previousLastModifiedAt.isBefore(firstDayOfMonth);
}

function billable(records: UpsertResult[]): UpsertResult[] {
    return records.filter((r) => {
        if (!r.previous_last_modified_at) {
            return true;
        }
        return isBillable({ last_modified_at: r.last_modified_at, previous_last_modified_at: r.previous_last_modified_at });
    });
}

export async function getRecordCountsByModel({
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

        const countsByModel: Record<string, RecordCount> = results.reduce((acc, result) => ({ ...acc, [result.model]: result }), {});
        return Ok(countsByModel);
    } catch {
        const e = new Error(`Count records error for connection ${connectionId} and environment ${environmentId}`);
        return Err(e);
    }
}

export async function countMetric(): Promise<Result<{ count: string }>> {
    // Note: count is a string because pg returns bigint as string
    try {
        const [count] = await db.from(RECORD_COUNTS_TABLE).sum('count as count');
        if (!count) {
            return Err(new Error(`Failed to count records`));
        }
        return Ok({ count });
    } catch {
        return Err(new Error(`Failed to count records`));
    }
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

            query = query.where(
                (builder) =>
                    void builder
                        .where('updated_at', '>', decodedCursor.sort)
                        .orWhere((builder) => void builder.where('updated_at', '=', decodedCursor.sort).andWhere('id', '>', decodedCursor.id))
            );
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
                id,
                json,
                to_json(created_at) as first_seen_at,
                to_json(updated_at) as last_modified_at,
                to_json(deleted_at) as deleted_at,
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

        const results = rawResults.map((item) => {
            const decryptedData = decryptRecordData(item);
            return {
                ...decryptedData,
                _nango_metadata: {
                    first_seen_at: item.first_seen_at,
                    last_modified_at: item.last_modified_at,
                    last_action: item.last_action,
                    deleted_at: item.deleted_at,
                    cursor: Cursor.new(item)
                }
            } as ReturnedRecord;
        });

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
        return Err(e);
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
    try {
        const query = db
            .from(RECORDS_TABLE)
            .select<{ id: string; last_modified_at: string }[]>(
                // PostgreSQL stores timestamp with microseconds precision
                // however, javascript date only supports milliseconds precision
                // we therefore convert timestamp to string (using to_json()) in order to avoid precision loss
                db.raw(`
                    id,
                    to_json(updated_at) as last_modified_at
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
        return Ok(Cursor.new(record));
    } catch (err) {
        return Err(new Error(`Error getting cursor for offset ${offset}`, { cause: err }));
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
    const { records: recordsWithoutDuplicates, nonUniqueKeys } = removeDuplicateKey(records);

    if (!recordsWithoutDuplicates || recordsWithoutDuplicates.length === 0) {
        return Err(
            `There are no records to upsert because there were no records that were not duplicates to insert, but there were ${records.length} records received for the "${model}" model.`
        );
    }

    const summary: UpsertSummary = { addedKeys: [], updatedKeys: [], deletedKeys: [], nonUniqueKeys, nextMerging: merging, billedKeys: [] };
    try {
        await db.transaction(async (trx) => {
            // Lock to prevent concurrent upserts
            await trx.raw(`SELECT pg_advisory_xact_lock(?) as lock_records_upsert`, [newLockId(connectionId, model)]);
            for (let i = 0; i < recordsWithoutDuplicates.length; i += BATCH_SIZE) {
                const chunk = recordsWithoutDuplicates.slice(i, i + BATCH_SIZE);
                const encryptedRecords = encryptRecords(chunk);

                // Retry if deadlock detected
                // https://www.postgresql.org/docs/current/mvcc-serialization-failure-handling.html
                const withRetry = async <T>(query: Knex.QueryBuilder<any, T>) => {
                    return retry(() => query, {
                        maxAttempts: 3,
                        delayMs: 500,
                        retryIf: (res) => {
                            if ('code' in res) {
                                const errorCode = (res as { code: string }).code;
                                return errorCode === '40P01'; // deadlock_detected
                            }
                            return false;
                        }
                    });
                };

                // we need to know which records were updated, deleted, undeleted or unchanged
                // we achieve this by comparing the records data_hash and deleted_at fields before and after the update
                const externalIds = chunk.map((r) => r.external_id);
                const query = trx
                    .with('existing', (qb) => {
                        qb.select('external_id', 'data_hash', 'deleted_at', 'updated_at')
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
                            .returning(['id', 'external_id', 'data_hash', 'deleted_at', 'updated_at'])
                            .onConflict(['connection_id', 'external_id', 'model'])
                            .merge();
                        if (merging.strategy === 'ignore_if_modified_after_cursor' && merging.cursor) {
                            const cursor = Cursor.from(merging.cursor);
                            if (cursor) {
                                qb.whereRaw(`${RECORDS_TABLE}.updated_at < ?`, [cursor.sort]).orWhereRaw(
                                    `${RECORDS_TABLE}.updated_at = ? AND ${RECORDS_TABLE}.id <= ?`,
                                    [cursor.sort, cursor.id]
                                );
                            }
                        }
                    })
                    .select<UpsertResult[]>(
                        trx.raw(`
                            upsert.id as id,
                            upsert.external_id as external_id,
                            to_json(upsert.updated_at) as last_modified_at,
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

                const res = await withRetry(query);

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
                    const billableKeys = [...insertedKeys, ...billable(changedRes).map((r) => r.external_id)];

                    summary.addedKeys.push(...addedKeys);
                    summary.updatedKeys.push(...updatedKeys);
                    summary.billedKeys.push(...billableKeys);
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
            }
            const delta = summary.addedKeys.length - (summary.deletedKeys?.length ?? 0);
            if (delta !== 0) {
                await trx
                    .from(RECORD_COUNTS_TABLE)
                    .insert({
                        connection_id: connectionId,
                        model,
                        environment_id: environmentId,
                        count: delta
                    })
                    .onConflict(['connection_id', 'environment_id', 'model'])
                    .merge({
                        count: trx.raw(`${RECORD_COUNTS_TABLE}.count + EXCLUDED.count`),
                        updated_at: trx.fn.now()
                    });
            }
        });

        return Ok(summary);
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

        return Err(errorMessage);
    }
}

export async function update({
    records,
    connectionId,
    model,
    merging = { strategy: 'override' }
}: {
    records: FormattedRecord[];
    connectionId: number;
    model: string;
    merging?: MergingStrategy;
}): Promise<Result<UpsertSummary>> {
    let nextMerging = merging;
    const { records: recordsWithoutDuplicates, nonUniqueKeys } = removeDuplicateKey(records);

    if (!recordsWithoutDuplicates || recordsWithoutDuplicates.length === 0) {
        return Err(
            `There are no records to upsert because there were no records that were not duplicates to insert, but there were ${records.length} records received for the "${model}" model.`
        );
    }

    try {
        const updatedKeys: string[] = [];
        const billedKeys: string[] = [];
        await db.transaction(async (trx) => {
            // Lock to prevent concurrent updates
            await trx.raw(`SELECT pg_advisory_xact_lock(?) as lock_records_update`, [newLockId(connectionId, model)]);
            for (let i = 0; i < recordsWithoutDuplicates.length; i += BATCH_SIZE) {
                const chunk = recordsWithoutDuplicates.slice(i, i + BATCH_SIZE);

                const oldRecords = await getRecordsToUpdate({ records: chunk, connectionId, model, trx });
                if (oldRecords.length === 0) {
                    logger.warning('Did not find any record to update', { connectionId, model });
                }

                const recordsToUpdate: FormattedRecord[] = [];
                for (const oldRecord of oldRecords) {
                    const oldRecordData = decryptRecordData(oldRecord);

                    const inputRecord = chunk.find((record) => record.external_id === oldRecord.external_id);
                    if (!inputRecord) {
                        continue;
                    }

                    const { json, ...newRecordRest } = inputRecord;
                    const newRecordData = decryptRecordData(inputRecord);

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
                        .with('upsert', (qb) => {
                            qb.from<{ external_id: string; id: string; last_modified_at: string }>(RECORDS_TABLE)
                                .insert(encryptedRecords)
                                .returning(['external_id', 'id', 'updated_at'])
                                .onConflict(['connection_id', 'external_id', 'model'])
                                .merge();
                            if (merging.strategy === 'ignore_if_modified_after_cursor' && merging.cursor) {
                                const cursor = Cursor.from(merging.cursor);
                                if (cursor) {
                                    qb.whereRaw(`${RECORDS_TABLE}.updated_at < ?`, [cursor.sort]).orWhereRaw(
                                        `${RECORDS_TABLE}.updated_at = ? AND ${RECORDS_TABLE}.id <= ?`,
                                        [cursor.sort, cursor.id]
                                    );
                                }
                            }
                        })
                        .select<
                            {
                                external_id: string;
                                id: string;
                                last_modified_at: string;
                            }[]
                        >(
                            trx.raw(`
                            upsert.id as id,
                            upsert.external_id as external_id,
                            to_json(upsert.updated_at) as last_modified_at`)
                        )
                        .from('upsert')
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
                        if (isBillable({ last_modified_at: record.last_modified_at, previous_last_modified_at: oldRecord.updated_at })) {
                            billedKeys.push(record.external_id);
                        }
                    }

                    const lastRecord = updated[updated.length - 1];
                    if (merging.strategy === 'ignore_if_modified_after_cursor' && lastRecord) {
                        nextMerging = {
                            strategy: merging.strategy,
                            cursor: Cursor.new(lastRecord)
                        };
                    }
                }
            }
        });
        return Ok({
            addedKeys: [],
            updatedKeys,
            deletedKeys: [],
            billedKeys,
            nonUniqueKeys,
            nextMerging
        });
    } catch (err: any) {
        let errorMessage = `Failed to update records to table ${RECORDS_TABLE}.\n`;
        errorMessage += `Model: ${model}, Nango Connection ID: ${connectionId}.\n`;
        errorMessage += `Attempted to update: ${recordsWithoutDuplicates.length} records\n`;

        if ('code' in err) errorMessage += `Error code: ${(err as { code: string }).code}.\n`;
        if ('detail' in err) errorMessage += `Detail: ${(err as { detail: string }).detail}.\n`;
        if ('message' in err) errorMessage += `Error Message: ${(err as { message: string }).message}`;

        return Err(errorMessage);
    }
}

export async function deleteRecordsBySyncId({
    connectionId,
    environmentId,
    model,
    syncId,
    limit = 5000
}: {
    connectionId: number;
    environmentId: number;
    model: string;
    syncId: string;
    limit?: number;
}): Promise<{ totalDeletedRecords: number }> {
    let totalDeletedRecords = 0;
    let deletedRecords = 0;
    do {
        // records table is partitioned by connection_id and model
        // to avoid table scan, we must filter by connection_id and model
        deletedRecords = await db
            .from(RECORDS_TABLE)
            .where({ connection_id: connectionId, model })
            .whereIn('id', function (sub) {
                sub.select('id').from(RECORDS_TABLE).where({ connection_id: connectionId, model, sync_id: syncId }).limit(limit);
            })
            .del();
        totalDeletedRecords += deletedRecords;
    } while (deletedRecords >= limit);
    await deleteRecordCount({ connectionId, environmentId, model });

    return { totalDeletedRecords };
}

export async function deleteRecordCount({ connectionId, environmentId, model }: { connectionId: number; environmentId: number; model: string }): Promise<void> {
    await db.from(RECORD_COUNTS_TABLE).where({ connection_id: connectionId, environment_id: environmentId, model }).del();
}

// Mark all non-deleted records from previous generations as deleted
// returns the ids of records being deleted
export async function markPreviousGenerationRecordsAsDeleted({
    connectionId,
    model,
    syncId,
    generation
}: {
    connectionId: number;
    model: string;
    syncId: string;
    generation: number;
}): Promise<string[]> {
    const now = db.fn.now(6);
    let res: string[] = [];
    return db.transaction(async (trx) => {
        res = (await trx
            .from<FormattedRecord>(RECORDS_TABLE)
            .where({
                connection_id: connectionId,
                model,
                sync_id: syncId,
                deleted_at: null
            })
            .where('sync_job_id', '<', generation)
            .update({
                deleted_at: now,
                updated_at: now,
                sync_job_id: generation
            })
            .returning('id')) as unknown as string[];

        // update records count
        const count = res.length;
        if (count > 0) {
            await trx(RECORD_COUNTS_TABLE)
                .where({
                    connection_id: connectionId,
                    model
                })
                .update({
                    count: trx.raw('GREATEST(0, count - ?)', [count])
                });
        }
        return res;
    });
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
