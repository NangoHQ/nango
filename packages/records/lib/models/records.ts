import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import { db } from '../db/client.js';
import type {
    FormattedRecord,
    FormattedRecordWithMetadata,
    GetRecordsResponse,
    LastAction,
    ReturnedRecord,
    UnencryptedRecord,
    UpsertSummary
} from '../types.js';
import { decryptRecord, decryptRecords, encryptRecords } from '../utils/encryption.js';
import { RECORDS_TABLE } from '../constants.js';
import { removeDuplicateKey, getUniqueId } from '../helpers/uniqueKey.js';
import { logger } from '../utils/logger.js';
import { resultErr, resultOk } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';
import { retry } from '@nangohq/utils';

dayjs.extend(utc);

const BATCH_SIZE = 1000;

export async function getRecords({
    connectionId,
    model,
    modifiedAfter,
    limit,
    filter,
    cursor
}: {
    connectionId: number;
    model: string;
    modifiedAfter?: string;
    limit?: number | string;
    filter?: LastAction;
    cursor?: string;
}): Promise<Result<GetRecordsResponse>> {
    try {
        if (!model) {
            const error = new Error('missing_model');
            return resultErr(error);
        }

        let query = db
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
            const decodedCursorValue = Buffer.from(cursor, 'base64').toString('ascii');
            const [cursorSort, cursorId] = decodedCursorValue.split('||');

            if (!cursorSort || !cursorId) {
                const error = new Error('invalid_cursor_value');
                return resultErr(error);
            }

            query = query.where(
                (builder) =>
                    void builder
                        .where('updated_at', '>', cursorSort)
                        .orWhere((builder) => void builder.where('updated_at', '=', cursorSort).andWhere('id', '>', cursorId))
            );
        }

        if (limit) {
            if (isNaN(Number(limit))) {
                const error = new Error('invalid_limit');
                return resultErr(error);
            }
            query = query.limit(Number(limit) + 1);
        } else {
            query = query.limit(101);
        }

        if (modifiedAfter) {
            const time = dayjs(modifiedAfter);

            if (!time.isValid()) {
                const error = new Error('invalid_timestamp');
                return resultErr(error);
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
            return resultOk({ records: [], next_cursor: null });
        }

        const results = rawResults.map((item) => {
            const decryptedData = decryptRecord(item);
            const encodedCursor = Buffer.from(`${item.last_modified_at}||${item.id}`).toString('base64');
            return {
                ...decryptedData,
                _nango_metadata: {
                    first_seen_at: item.first_seen_at,
                    last_modified_at: item.last_modified_at,
                    last_action: item.last_action,
                    deleted_at: item.deleted_at,
                    cursor: encodedCursor
                }
            } as ReturnedRecord;
        });

        if (results.length > Number(limit || 100)) {
            results.pop();
            rawResults.pop();

            const cursorRawElement = rawResults[rawResults.length - 1];
            if (cursorRawElement) {
                const encodedCursorValue = Buffer.from(`${cursorRawElement.last_modified_at}||${cursorRawElement.id}`).toString('base64');
                return resultOk({ records: results, next_cursor: encodedCursorValue });
            }
        }
        return resultOk({ records: results, next_cursor: null });
    } catch (_error) {
        // TODO: telemetry doesn't belong in models
        // await telemetry.log(LogTypes.SYNC_GET_RECORDS_QUERY_TIMEOUT, errorMessage, LogActionEnum.SYNC, {
        //     environmentId: String(environmentId),
        //     connectionId: String(connectionId),
        //     modifiedAfter: String(modifiedAfter),
        //     model,
        //     error: stringifyError(e)
        // });
        const e = new Error(`List records error for model ${model}`);
        return resultErr(e);
    }
}

export async function upsert(records: FormattedRecord[], connectionId: number, model: string, softDelete = false): Promise<Result<UpsertSummary>> {
    const { records: recordsWithoutDuplicates, nonUniqueKeys } = removeDuplicateKey(records);

    if (!recordsWithoutDuplicates || recordsWithoutDuplicates.length === 0) {
        return resultErr(
            `There are no records to upsert because there were no records that were not duplicates to insert, but there were ${records.length} records received for the "${model}" model.`
        );
    }

    let summary: UpsertSummary = { addedKeys: [], updatedKeys: [], deletedKeys: [], nonUniqueKeys };
    try {
        const upserting = async () =>
            await db.transaction(async (trx) => {
                for (let i = 0; i < recordsWithoutDuplicates.length; i += BATCH_SIZE) {
                    const chunk = recordsWithoutDuplicates.slice(i, i + BATCH_SIZE);
                    const chunkSummary = await getUpsertSummary(chunk, connectionId, model, nonUniqueKeys, softDelete, trx);
                    summary = {
                        addedKeys: [...summary.addedKeys, ...chunkSummary.addedKeys],
                        updatedKeys: [...summary.updatedKeys, ...chunkSummary.updatedKeys],
                        deletedKeys: [...(summary.deletedKeys || []), ...(chunkSummary.deletedKeys || [])],
                        nonUniqueKeys: nonUniqueKeys
                    };
                    const encryptedRecords = encryptRecords(chunk);
                    await trx.from<FormattedRecord>(RECORDS_TABLE).insert(encryptedRecords).onConflict(['connection_id', 'external_id', 'model']).merge();
                }
            });
        // Retry upserting if deadlock detected
        // https://www.postgresql.org/docs/current/mvcc-serialization-failure-handling.html
        await retry(upserting, {
            maxAttempts: 3,
            delayMs: 500,
            retryIf: (error) => {
                if ('code' in error) {
                    const errorCode = (error as { code: string }).code;
                    return errorCode === '40P01'; // deadlock_detected                    }
                }
                return false;
            }
        });

        return resultOk(summary);
    } catch (error: any) {
        let errorMessage = `Failed to upsert records to table ${RECORDS_TABLE}.\n`;
        errorMessage += `Model: ${model}, Nango Connection ID: ${connectionId}.\n`;
        errorMessage += `Attempted to insert/update/delete: ${recordsWithoutDuplicates.length} records\n`;

        if ('code' in error) {
            const errorCode = (error as { code: string }).code;
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

        logger.error(`${errorMessage}${error}`);

        return resultErr(errorMessage);
    }
}

export async function update(records: FormattedRecord[], connectionId: number, model: string): Promise<Result<UpsertSummary>> {
    const { records: recordsWithoutDuplicates, nonUniqueKeys } = removeDuplicateKey(records);

    if (!recordsWithoutDuplicates || recordsWithoutDuplicates.length === 0) {
        return resultErr(
            `There are no records to upsert because there were no records that were not duplicates to insert, but there were ${records.length} records received for the "${model}" model.`
        );
    }

    try {
        const updatedKeys: string[] = [];
        await db.transaction(async (trx) => {
            for (let i = 0; i < recordsWithoutDuplicates.length; i += BATCH_SIZE) {
                const chunk = recordsWithoutDuplicates.slice(i, i + BATCH_SIZE);

                updatedKeys.push(...(await getUpdatedKeys(chunk, connectionId, model, trx)));

                const recordsToUpdate: FormattedRecord[] = [];
                const rawOldRecords = await getRecordsByExternalIds(updatedKeys, connectionId, model, trx);
                for (const rawOldRecord of rawOldRecords) {
                    if (!rawOldRecord) {
                        continue;
                    }

                    const { record: oldRecord, ...oldRecordRest } = rawOldRecord;

                    const record = records.find((record) => record.external_id === oldRecord.id);

                    const newRecord: FormattedRecord = {
                        ...oldRecordRest,
                        json: {
                            ...oldRecord,
                            ...record?.json
                        },
                        updated_at: new Date()
                    };
                    recordsToUpdate.push(newRecord);
                }
                const encryptedRecords = encryptRecords(recordsToUpdate);
                await trx.from(RECORDS_TABLE).insert(encryptedRecords).onConflict(['connection_id', 'external_id', 'model']).merge();
            }
        });

        return resultOk({
            addedKeys: [],
            updatedKeys,
            deletedKeys: [],
            nonUniqueKeys
        });
    } catch (error: any) {
        let errorMessage = `Failed to update records to table ${RECORDS_TABLE}.\n`;
        errorMessage += `Model: ${model}, Nango Connection ID: ${connectionId}.\n`;
        errorMessage += `Attempted to update: ${recordsWithoutDuplicates.length} records\n`;

        if ('code' in error) errorMessage += `Error code: ${(error as { code: string }).code}.\n`;
        if ('detail' in error) errorMessage += `Detail: ${(error as { detail: string }).detail}.\n`;
        if ('message' in error) errorMessage += `Error Message: ${(error as { message: string }).message}`;

        return resultErr(errorMessage);
    }
}

export async function deleteRecordsBySyncId({ syncId, limit = 5000 }: { syncId: string; limit?: number }): Promise<{ totalDeletedRecords: number }> {
    let totalDeletedRecords = 0;
    let deletedRecords = 0;
    do {
        deletedRecords = await db
            .from(RECORDS_TABLE)
            .whereIn('id', function (sub) {
                void sub.select('id').from(RECORDS_TABLE).where({ sync_id: syncId }).limit(limit);
            })
            .del();
        totalDeletedRecords += deletedRecords;
    } while (deletedRecords >= limit);

    return { totalDeletedRecords };
}

// Mark all non-deleted records that don't belong to currentGeneration as deleted
// returns the ids of records being deleted
export async function markNonCurrentGenerationRecordsAsDeleted(connectionId: number, model: string, syncId: string, generation: number): Promise<string[]> {
    const now = db.fn.now(6);
    return (await db
        .from<FormattedRecord>(RECORDS_TABLE)
        .where({
            connection_id: connectionId,
            model,
            sync_id: syncId,
            deleted_at: null
        })
        .whereNot({
            sync_job_id: generation
        })
        .update({
            deleted_at: now,
            updated_at: now,
            sync_job_id: generation
        })
        .returning('id')) as unknown as string[];
}

/**
 * getUpdatedKeys
 * @desc returns a list of the keys that exist in the records tables but have a different data_hash
 */
async function getUpdatedKeys(records: FormattedRecord[], connectionId: number, model: string, trx: Knex.Transaction): Promise<string[]> {
    const keys: string[] = records.map((record: FormattedRecord) => getUniqueId(record));
    const keysWithHash: [string, string][] = records.map((record: FormattedRecord) => [getUniqueId(record), record.data_hash]);

    const rowsToUpdate = (await trx
        .from(RECORDS_TABLE)
        .pluck('external_id')
        .where({
            connection_id: connectionId,
            model
        })
        .whereIn('external_id', keys)
        .whereNotIn(['external_id', 'data_hash'], keysWithHash)) as unknown as string[];

    return rowsToUpdate;
}

async function getUpsertSummary(
    records: FormattedRecord[],
    connectionId: number,
    model: string,
    nonUniqueKeys: string[],
    softDelete: boolean,
    trx: Knex.Transaction
): Promise<UpsertSummary> {
    const keys: string[] = records.map((record: FormattedRecord) => getUniqueId(record));
    const nonDeletedKeys: string[] = await trx
        .from(RECORDS_TABLE)
        .where({
            connection_id: connectionId,
            model,
            deleted_at: null
        })
        .whereIn('external_id', keys)
        .pluck('external_id');

    if (softDelete) {
        return {
            addedKeys: [],
            updatedKeys: [],
            deletedKeys: nonDeletedKeys,
            nonUniqueKeys: nonUniqueKeys
        };
    } else {
        const addedKeys = keys?.filter((key: string) => !nonDeletedKeys.includes(key));
        const updatedKeys = await getUpdatedKeys(records, connectionId, model, trx);
        return {
            addedKeys,
            updatedKeys,
            deletedKeys: [],
            nonUniqueKeys: nonUniqueKeys
        };
    }
}

async function getRecordsByExternalIds(external_ids: string[], connection_id: number, model: string, trx: Knex.Transaction): Promise<UnencryptedRecord[]> {
    const encryptedRecords = await trx
        .from<FormattedRecord>(RECORDS_TABLE)
        .where({
            connection_id,
            model
        })
        .whereIn('external_id', external_ids);

    if (!encryptedRecords) {
        return [];
    }

    const result = decryptRecords(encryptedRecords);

    if (!result || result.length === 0) {
        return [];
    }

    return result;
}
