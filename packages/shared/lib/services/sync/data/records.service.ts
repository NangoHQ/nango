import md5 from 'md5';
import * as uuid from 'uuid';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

import type {
    DataRecord as SyncDataRecord,
    RecordWrapCustomerFacingDataRecord,
    RawDataRecordResult,
    CustomerFacingDataRecord,
    DataRecordWithMetadata,
    GetRecordsResponse,
    LastAction
} from '../../../models/Sync.js';
import type { DataResponse } from '../../../models/Data.js';
import type { ServiceResponse } from '../../../models/Generic.js';
import db, { schema } from '../../../db/database.js';
import connectionService from '../../connection.service.js';
import { NangoError } from '../../../utils/error.js';
import encryptionManager from '../../../utils/encryption.manager.js';
import telemetry, { LogTypes } from '../../../utils/telemetry.js';
import { LogActionEnum } from '../../../models/Activity.js';
import { trackFetch } from '../sync.service.js';
import { stringifyError } from '@nangohq/utils';

dayjs.extend(utc);

const RECORDS_TABLE = '_nango_sync_data_records';

export const formatDataRecords = (
    records: DataResponse[],
    nango_connection_id: number,
    model: string,
    syncId: string,
    sync_job_id: number,
    softDelete = false
): ServiceResponse<SyncDataRecord[]> => {
    // hashing unique composite key (connection, model, external_id)
    // to generate stable record ids across script executions
    const stableId = (rawRecord: DataResponse): string => {
        const namespace = uuid.v5(`${nango_connection_id}${model}`, uuid.NIL);
        return uuid.v5(`${nango_connection_id}${model}${rawRecord.id}`, namespace);
    };
    const formattedRecords: SyncDataRecord[] = [];
    const now = new Date();
    for (const record of records) {
        const data_hash = md5(JSON.stringify(record));

        if (!record) {
            break;
        }

        if (!record['id']) {
            const error = new NangoError('missing_id_field', model);
            return { success: false, error, response: null };
        }

        const formattedRecord: SyncDataRecord = {
            id: stableId(record),
            json: record,
            external_id: record['id'],
            data_hash,
            model,
            nango_connection_id,
            sync_id: syncId,
            sync_job_id,
            external_is_deleted: softDelete,
            pending_delete: false
        };

        if (softDelete) {
            const deletedAt = record['deletedAt'];
            formattedRecord.updated_at = now;
            formattedRecord.external_deleted_at = deletedAt ? dayjs(deletedAt as string).toDate() : now;
        } else {
            formattedRecord.external_deleted_at = null;
        }
        formattedRecords.push(formattedRecord);
    }
    return { success: true, error: null, response: formattedRecords };
};

// TO DEPRECATE
export async function getDataRecords(
    connectionId: string,
    providerConfigKey: string,
    environmentId: number,
    model: string,
    delta?: string,
    offset?: number | string,
    limit?: number | string,
    sortBy?: string,
    order?: 'asc' | 'desc',
    filter?: LastAction,
    includeMetaData = false
): Promise<ServiceResponse<CustomerFacingDataRecord[] | DataRecordWithMetadata[] | null>> {
    if (!model) {
        const error = new NangoError('missing_model');

        return { success: false, error, response: null };
    }

    const { success, error, response: nangoConnection } = await connectionService.getConnection(connectionId, providerConfigKey, environmentId);

    if (!success) {
        return { success, error, response: null };
    }

    if (!nangoConnection) {
        throw new Error(`No connection found for connectionId ${connectionId} and providerConfigKey ${providerConfigKey}`);
    }

    await telemetry.log(LogTypes.SYNC_GET_RECORDS_DEPRECATED_METHOD_USED, `Deprecated get records method`, LogActionEnum.SYNC, {
        environmentId: String(environmentId),
        connectionId,
        providerConfigKey,
        delta: String(delta),
        model
    });

    if (order) {
        await telemetry.log(LogTypes.SYNC_GET_RECORDS_ORDER_USED, `Order used in get records with a order value of ${order}`, LogActionEnum.SYNC, {
            environmentId: String(environmentId),
            connectionId,
            providerConfigKey,
            delta: String(delta),
            order,
            model
        });
    }

    let sort = 'external_id';

    switch (sortBy) {
        case 'updated_at': {
            sort = 'updated_at';
            await telemetry.log(LogTypes.SYNC_GET_RECORDS_SORT_BY_USED, `Sort by used in get records with a sort value of ${sort}`, LogActionEnum.SYNC, {
                environmentId: String(environmentId),
                connectionId,
                providerConfigKey,
                delta: String(delta),
                sort,
                model
            });

            break;
        }
        case 'created_at': {
            sort = 'created_at';
            await telemetry.log(LogTypes.SYNC_GET_RECORDS_SORT_BY_USED, `Sort by used in get records with a sort value of ${sort}`, LogActionEnum.SYNC, {
                environmentId: String(environmentId),
                connectionId,
                providerConfigKey,
                delta: String(delta),
                sort,
                model
            });
            break;
        }
        case 'id': {
            await telemetry.log(LogTypes.SYNC_GET_RECORDS_SORT_BY_USED, `Sort by used in get records with a sort value of ${sort}`, LogActionEnum.SYNC, {
                environmentId: String(environmentId),
                connectionId,
                providerConfigKey,
                delta: String(delta),
                sort,
                model
            });
        }
    }

    let query = schema()
        .from<SyncDataRecord>(RECORDS_TABLE)
        .timeout(60000) // timeout for 1 minute
        .where({
            nango_connection_id: Number(nangoConnection.id),
            model
        })
        .orderBy(sort, order?.toLowerCase() === 'asc' ? 'asc' : 'desc');

    if (offset) {
        if (isNaN(Number(offset))) {
            const error = new NangoError('invalid_offset');

            return { success: false, error, response: null };
        }

        await telemetry.log(LogTypes.SYNC_GET_RECORDS_OFFSET_USED, `Offset used in get records with an offset value of ${offset}`, LogActionEnum.SYNC, {
            environmentId: String(environmentId),
            connectionId,
            providerConfigKey,
            delta: String(delta),
            model
        });

        query = query.offset(Number(offset));
    }

    if (limit) {
        if (isNaN(Number(limit))) {
            const error = new NangoError('invalid_limit');

            return { success: false, error, response: null };
        }
        query = query.limit(Number(limit));
    }

    if (delta) {
        const time = dayjs(delta);

        if (!time.isValid()) {
            const error = new NangoError('invalid_timestamp');

            return { success: false, error, response: null };
        }

        const timeToDate = time.toDate();

        const utcString = timeToDate.toUTCString();
        query = query.andWhere('updated_at', '>=', utcString);
    }

    if (filter) {
        const formattedFilter = filter.toUpperCase();
        switch (true) {
            case formattedFilter.includes('ADDED') && formattedFilter.includes('UPDATED'):
                query = query.andWhere('external_deleted_at', null).andWhere(function () {
                    this.where('created_at', '=', db.knex.raw('updated_at')).orWhere('created_at', '!=', db.knex.raw('updated_at'));
                });
                break;
            case formattedFilter.includes('UPDATED') && formattedFilter.includes('DELETED'):
                query = query.andWhere(function () {
                    this.where('external_is_deleted', true).orWhere('external_deleted_at', null).andWhere('created_at', '!=', db.knex.raw('updated_at'));
                });
                break;
            case formattedFilter.includes('ADDED') && formattedFilter.includes('DELETED'):
                query = query.andWhere(function () {
                    this.where('external_is_deleted', true).orWhere('external_deleted_at', null).andWhere('created_at', '=', db.knex.raw('updated_at'));
                });
                break;
            case formattedFilter === 'ADDED':
                query = query.andWhere('external_deleted_at', null).andWhere('created_at', '=', db.knex.raw('updated_at'));
                break;
            case formattedFilter === 'UPDATED':
                query = query.andWhere('external_deleted_at', null).andWhere('created_at', '!=', db.knex.raw('updated_at'));
                break;
            case formattedFilter === 'DELETED':
                query = query.andWhere({ external_is_deleted: true });
                break;
        }
    }

    let result;

    if (includeMetaData) {
        await telemetry.log(LogTypes.SYNC_GET_RECORDS_INCLUDE_METADATA_USED, `Include Nango metadata used in get records`, LogActionEnum.SYNC, {
            environmentId: String(environmentId),
            connectionId,
            providerConfigKey,
            delta: String(delta),
            model
        });

        result = await query.select(
            'created_at as first_seen_at',
            'updated_at as last_modified_at',
            'external_deleted_at as deleted_at',
            db.knex.raw(`
                CASE
                    WHEN external_deleted_at IS NOT NULL THEN 'DELETED'
                    WHEN created_at = updated_at THEN 'ADDED'
                    ELSE 'UPDATED'
                END as last_action`),
            'json as record'
        );
        result = encryptionManager.decryptDataRecords(result, 'record') as unknown as DataRecordWithMetadata[];
    } else {
        result = await query.select(
            db.knex.raw(`
                jsonb_set(
                    json::jsonb,
                    '{_nango_metadata}',
                    jsonb_build_object(
                        'first_seen_at', created_at,
                        'last_modified_at', updated_at,
                        'deleted_at', external_deleted_at,
                        'last_action',
                        CASE
                            WHEN external_deleted_at IS NOT NULL THEN 'DELETED'
                            WHEN created_at = updated_at THEN 'ADDED'
                            ELSE 'UPDATED'
                        END
                    )
                ) as record
            `)
        );

        result = encryptionManager.decryptDataRecords(result, 'record') as unknown as RecordWrapCustomerFacingDataRecord;

        result = result.map((item: { record: CustomerFacingDataRecord }) => item.record);
    }

    return { success: true, error: null, response: result };
}

export async function getAllDataRecords(
    connectionId: string,
    providerConfigKey: string,
    environmentId: number,
    model: string,
    modifiedAfter?: string,
    limit?: number | string,
    filter?: LastAction,
    cursorValue?: string | null
): Promise<ServiceResponse<GetRecordsResponse>> {
    try {
        if (!model) {
            const error = new NangoError('missing_model');

            return { success: false, error, response: null };
        }

        const { success, error, response: nangoConnection } = await connectionService.getConnection(connectionId, providerConfigKey, environmentId);

        if (!success) {
            return { success, error, response: null };
        }

        if (!nangoConnection) {
            throw new Error(`No connection found for connectionId ${connectionId} and providerConfigKey ${providerConfigKey}`);
        }

        await trackFetch(Number(nangoConnection.id));

        let query = schema()
            .from<SyncDataRecord>(RECORDS_TABLE)
            .timeout(60000) // timeout for 1 minute
            .where({
                nango_connection_id: Number(nangoConnection.id),
                model
            })
            .orderBy([
                { column: 'updated_at', order: 'asc' },
                { column: 'id', order: 'asc' }
            ]);

        if (cursorValue) {
            const decodedCursorValue = Buffer.from(cursorValue, 'base64').toString('ascii');
            const [cursorSort, cursorId] = decodedCursorValue.split('||');

            if (!cursorSort || !cursorId) {
                const error = new NangoError('invalid_cursor_value');

                return { success: false, error, response: null };
            }

            query = query.where((builder) =>
                builder.where('updated_at', '>', cursorSort).orWhere((builder) => builder.where('updated_at', '=', cursorSort).andWhere('id', '>', cursorId))
            );
        }

        if (limit) {
            if (isNaN(Number(limit))) {
                const error = new NangoError('invalid_limit');

                return { success: false, error, response: null };
            }
            query = query.limit(Number(limit) + 1);
        } else {
            query = query.limit(101);
        }

        if (modifiedAfter) {
            const time = dayjs(modifiedAfter);

            if (!time.isValid()) {
                const error = new NangoError('invalid_timestamp');

                return { success: false, error, response: null };
            }

            const formattedDelta = time.toISOString();

            query = query.andWhere('updated_at', '>=', formattedDelta);
        }

        if (filter) {
            const formattedFilter = filter.toUpperCase();
            switch (true) {
                case formattedFilter.includes('ADDED') && formattedFilter.includes('UPDATED'):
                    query = query.andWhere('external_deleted_at', null).andWhere(function () {
                        this.where('created_at', '=', db.knex.raw('updated_at')).orWhere('created_at', '!=', db.knex.raw('updated_at'));
                    });
                    break;
                case formattedFilter.includes('UPDATED') && formattedFilter.includes('DELETED'):
                    query = query.andWhere(function () {
                        this.where('external_is_deleted', true).orWhere('external_deleted_at', null).andWhere('created_at', '!=', db.knex.raw('updated_at'));
                    });
                    break;
                case formattedFilter.includes('ADDED') && formattedFilter.includes('DELETED'):
                    query = query.andWhere(function () {
                        this.where('external_is_deleted', true).orWhere('external_deleted_at', null).andWhere('created_at', '=', db.knex.raw('updated_at'));
                    });
                    break;
                case formattedFilter === 'ADDED':
                    query = query.andWhere('external_deleted_at', null).andWhere('created_at', '=', db.knex.raw('updated_at'));
                    break;
                case formattedFilter === 'UPDATED':
                    query = query.andWhere('external_deleted_at', null).andWhere('created_at', '!=', db.knex.raw('updated_at'));
                    break;
                case formattedFilter === 'DELETED':
                    query = query.andWhere({ external_is_deleted: true });
                    break;
            }
        }

        const rawResults: RawDataRecordResult[] = await query.select(
            // PostgreSQL stores timestamp with microseconds precision
            // however, javascript date only supports milliseconds precision
            // we therefore convert timestamp to string (using to_json()) in order to avoid precision loss
            db.knex.raw(`
                id,
                json as record,
                to_json(created_at) as first_seen_at,
                to_json(updated_at) as last_modified_at,
                to_json(external_deleted_at) as deleted_at,
                CASE
                    WHEN external_deleted_at IS NOT NULL THEN 'DELETED'
                    WHEN created_at = updated_at THEN 'ADDED'
                    ELSE 'UPDATED'
                END as last_action
            `)
        );

        if (rawResults.length === 0) {
            return { success: true, error: null, response: { records: [], next_cursor: null } };
        }

        const results = rawResults.map((item) => {
            const decryptedRecord = encryptionManager.decryptDataRecord(item);
            const encodedCursor = Buffer.from(`${item.last_modified_at}||${item.id}`).toString('base64');
            return {
                ...decryptedRecord,
                _nango_metadata: {
                    first_seen_at: item.first_seen_at,
                    last_modified_at: item.last_modified_at,
                    last_action: item.last_action,
                    deleted_at: item.deleted_at,
                    cursor: encodedCursor
                }
            } as CustomerFacingDataRecord;
        });

        if (results.length > Number(limit || 100)) {
            results.pop();
            rawResults.pop();

            const cursorRawElement = rawResults[rawResults.length - 1];
            if (cursorRawElement) {
                const encodedCursorValue = Buffer.from(`${cursorRawElement.last_modified_at}||${cursorRawElement.id}`).toString('base64');
                return { success: true, error: null, response: { records: results, next_cursor: encodedCursorValue } };
            }
        }
        return { success: true, error: null, response: { records: results, next_cursor: null } };
    } catch (e: any) {
        const errorMessage = `List records error for model ${model}`;
        await telemetry.log(LogTypes.SYNC_GET_RECORDS_QUERY_TIMEOUT, errorMessage, LogActionEnum.SYNC, {
            environmentId: String(environmentId),
            connectionId,
            providerConfigKey,
            modifiedAfter: String(modifiedAfter),
            model,
            error: stringifyError(e)
        });

        const error = new Error(errorMessage);
        const nangoError = new NangoError('pass_through_error', error);
        return { success: false, error: nangoError, response: null };
    }
}

export function verifyUniqueKeysAreUnique(data: DataResponse[], optionalUniqueKey?: string | number): { isUnique: boolean; nonUniqueKeys: string[] } {
    const uniqueKey = optionalUniqueKey ?? 'id';
    const idMap: Record<string, boolean> = {};
    let isUnique = true;
    const nonUniqueKeys: string[] = [];

    for (const item of data) {
        const id = item[uniqueKey] as string | number;

        if (idMap[id]) {
            isUnique = false;
            if (!nonUniqueKeys.includes(id.toString())) {
                nonUniqueKeys.push(id.toString());
            }
        } else {
            idMap[id] = true;
        }
    }

    return { isUnique, nonUniqueKeys };
}

export async function getRecordsByExternalIds(external_ids: string[], nango_connection_id: number, model: string): Promise<SyncDataRecord[]> {
    const encryptedRecords = await schema()
        .from<SyncDataRecord>(RECORDS_TABLE)
        .where({
            nango_connection_id,
            model
        })
        .whereIn('external_id', external_ids);

    if (!encryptedRecords) {
        return [];
    }

    const result = encryptionManager.decryptDataRecords(encryptedRecords, 'json');

    if (!result || result.length === 0) {
        return [];
    }

    return result as unknown as SyncDataRecord[];
}

export async function deleteRecordsBySyncId({ syncId, limit = 5000 }: { syncId: string; limit?: number }): Promise<{ totalDeletedRecords: number }> {
    let totalDeletedRecords = 0;
    let deletedRecords = 0;
    do {
        deletedRecords = await db
            .knex(RECORDS_TABLE)
            .whereIn('id', function (sub) {
                sub.select('id').from(RECORDS_TABLE).where({ sync_id: syncId }).limit(limit);
            })
            .del();
        totalDeletedRecords += deletedRecords;
    } while (deletedRecords >= limit);

    return { totalDeletedRecords };
}

// Mark all non-deleted records that don't belong to currentGeneration as deleted
// returns the ids of records being deleted
export async function markNonCurrentGenerationRecordsAsDeleted(connectionId: number, model: string, syncId: string, generation: number): Promise<string[]> {
    const now = db.knex.fn.now(6);
    return (await schema()
        .from<SyncDataRecord>(RECORDS_TABLE)
        .where({
            nango_connection_id: connectionId,
            model,
            sync_id: syncId,
            external_is_deleted: false
        })
        .whereNot({
            sync_job_id: generation
        })
        .update({
            external_is_deleted: true,
            external_deleted_at: now,
            updated_at: now,
            sync_job_id: generation
        })
        .returning('id')) as unknown as string[];
}
