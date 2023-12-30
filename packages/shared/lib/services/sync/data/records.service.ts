import md5 from 'md5';
import * as uuid from 'uuid';
import dayjs from 'dayjs';

import type {
    DataRecord as SyncDataRecord,
    RecordWrapCustomerFacingDataRecord,
    CustomerFacingDataRecord,
    DataRecordWithMetadata,
    GetRecordsResponse
} from '../../../models/Sync.js';
import type { DataResponse } from '../../../models/Data.js';
import type { ServiceResponse } from '../../../models/Generic.js';
import db, { schema } from '../../../db/database.js';
import connectionService from '../../connection.service.js';
import { NangoError } from '../../../utils/error.js';
import encryptionManager from '../../../utils/encryption.manager.js';
import metricsManager, { MetricTypes } from '../../../utils/metrics.manager.js';
import { LogActionEnum } from '../../../models/Activity.js';

export const formatDataRecords = (
    records: DataResponse[],
    nango_connection_id: number,
    model: string,
    syncId: string,
    sync_job_id: number,
    lastSyncDate = new Date(),
    trackDeletes = false,
    softDelete = false
): ServiceResponse<SyncDataRecord[]> => {
    const formattedRecords: SyncDataRecord[] = [] as SyncDataRecord[];

    const deletedAtKey = 'deletedAt';

    let oldTimestamp = new Date();

    if (trackDeletes) {
        oldTimestamp = lastSyncDate;
    }

    for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const data_hash = md5(JSON.stringify(record));

        if (!record) {
            break;
        }

        if (!record['id']) {
            const error = new NangoError('missing_id_field', model);
            return { success: false, error, response: null };
        }

        let external_deleted_at = null;

        if (softDelete) {
            if (record[deletedAtKey]) {
                external_deleted_at = dayjs(record[deletedAtKey] as string).toDate();
            } else {
                external_deleted_at = new Date();
            }
        }

        const external_id = record['id'] as string;
        formattedRecords[i] = {
            id: uuid.v4(),
            json: record,
            external_id,
            data_hash,
            model,
            nango_connection_id,
            sync_id: syncId,
            sync_job_id,
            external_is_deleted: softDelete,
            external_deleted_at,
            pending_delete: false
        };

        if (trackDeletes) {
            formattedRecords[i]!.created_at = oldTimestamp;
            formattedRecords[i]!.updated_at = oldTimestamp;
        }
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
    filter?: 'added' | 'updated' | 'deleted',
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

    await metricsManager.capture(MetricTypes.SYNC_GET_RECORDS_DEPRECATED_METHOD_USED, `Deprecated get records method`, LogActionEnum.SYNC, {
        environmentId: String(environmentId),
        connectionId,
        providerConfigKey,
        delta: String(delta),
        model
    });

    if (order) {
        await metricsManager.capture(MetricTypes.SYNC_GET_RECORDS_ORDER_USED, `Order used in get records with a order value of ${order}`, LogActionEnum.SYNC, {
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
            await metricsManager.capture(
                MetricTypes.SYNC_GET_RECORDS_SORT_BY_USED,
                `Sort by used in get records with a sort value of ${sort}`,
                LogActionEnum.SYNC,
                {
                    environmentId: String(environmentId),
                    connectionId,
                    providerConfigKey,
                    delta: String(delta),
                    sort,
                    model
                }
            );

            break;
        }
        case 'created_at': {
            sort = 'created_at';
            await metricsManager.capture(
                MetricTypes.SYNC_GET_RECORDS_SORT_BY_USED,
                `Sort by used in get records with a sort value of ${sort}`,
                LogActionEnum.SYNC,
                {
                    environmentId: String(environmentId),
                    connectionId,
                    providerConfigKey,
                    delta: String(delta),
                    sort,
                    model
                }
            );
            break;
        }
        case 'id': {
            await metricsManager.capture(
                MetricTypes.SYNC_GET_RECORDS_SORT_BY_USED,
                `Sort by used in get records with a sort value of ${sort}`,
                LogActionEnum.SYNC,
                {
                    environmentId: String(environmentId),
                    connectionId,
                    providerConfigKey,
                    delta: String(delta),
                    sort,
                    model
                }
            );
        }
    }

    let query = schema()
        .from<SyncDataRecord>(`_nango_sync_data_records`)
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

        await metricsManager.capture(
            MetricTypes.SYNC_GET_RECORDS_OFFSET_USED,
            `Offset used in get records with an offset value of ${offset}`,
            LogActionEnum.SYNC,
            {
                environmentId: String(environmentId),
                connectionId,
                providerConfigKey,
                delta: String(delta),
                model
            }
        );

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
        switch (true) {
            case filter.includes('added') && filter.includes('updated'):
                query = query.andWhere('external_deleted_at', null).andWhere(function () {
                    this.where('created_at', '=', db.knex.raw('updated_at')).orWhere('created_at', '!=', db.knex.raw('updated_at'));
                });
                break;
            case filter.includes('updated') && filter.includes('deleted'):
                query = query.andWhere(function () {
                    this.where('external_is_deleted', true).orWhere('external_deleted_at', null).andWhere('created_at', '!=', db.knex.raw('updated_at'));
                });
                break;
            case filter.includes('added') && filter.includes('deleted'):
                query = query.andWhere(function () {
                    this.where('external_is_deleted', true).orWhere('external_deleted_at', null).andWhere('created_at', '=', db.knex.raw('updated_at'));
                });
                break;
            case filter === 'added':
                query = query.andWhere('external_deleted_at', null).andWhere('created_at', '=', db.knex.raw('updated_at'));
                break;
            case filter === 'updated':
                query = query.andWhere('external_deleted_at', null).andWhere('created_at', '!=', db.knex.raw('updated_at'));
                break;
            case filter === 'deleted':
                query = query.andWhere({ external_is_deleted: true });
                break;
        }
    }

    let result;

    if (includeMetaData) {
        await metricsManager.capture(MetricTypes.SYNC_GET_RECORDS_INCLUDE_METADATA_USED, `Include Nango metadata used in get records`, LogActionEnum.SYNC, {
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
    delta?: string,
    limit?: number | string,
    filter?: 'added' | 'updated' | 'deleted',
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

        let query = schema()
            .from<SyncDataRecord>(`_nango_sync_data_records`)
            .timeout(60000) // timeout for 1 minute
            .where({
                nango_connection_id: Number(nangoConnection.id),
                model
            })
            .orderBy([
                { column: 'created_at', order: 'asc' },
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
                builder
                    .where('created_at', '>', cursorSort)
                    .orWhere((builder) => builder.where('created_at' as string, '=', cursorSort).andWhere('id', '>', cursorId))
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
            switch (true) {
                case filter.includes('added') && filter.includes('updated'):
                    query = query.andWhere('external_deleted_at', null).andWhere(function () {
                        this.where('created_at', '=', db.knex.raw('updated_at')).orWhere('created_at', '!=', db.knex.raw('updated_at'));
                    });
                    break;
                case filter.includes('updated') && filter.includes('deleted'):
                    query = query.andWhere(function () {
                        this.where('external_is_deleted', true).orWhere('external_deleted_at', null).andWhere('created_at', '!=', db.knex.raw('updated_at'));
                    });
                    break;
                case filter.includes('added') && filter.includes('deleted'):
                    query = query.andWhere(function () {
                        this.where('external_is_deleted', true).orWhere('external_deleted_at', null).andWhere('created_at', '=', db.knex.raw('updated_at'));
                    });
                    break;
                case filter === 'added':
                    query = query.andWhere('external_deleted_at', null).andWhere('created_at', '=', db.knex.raw('updated_at'));
                    break;
                case filter === 'updated':
                    query = query.andWhere('external_deleted_at', null).andWhere('created_at', '!=', db.knex.raw('updated_at'));
                    break;
                case filter === 'deleted':
                    query = query.andWhere({ external_is_deleted: true });
                    break;
            }
        }

        let nextCursor = null;

        const rawResult = await query.select(
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
                ) as record, id
            `)
        );

        const result = encryptionManager.decryptDataRecords(rawResult, 'record') as unknown as SyncDataRecord[];

        if (result.length === 0) {
            return { success: true, error: null, response: { records: [], next_cursor: nextCursor } };
        }

        const customerResult = result.map((item) => item.record);

        if (customerResult.length > (limit || 100)) {
            customerResult.pop();
            rawResult.pop();

            const cursorRawElement = rawResult[rawResult.length - 1] as SyncDataRecord;
            const cursorElement = customerResult[customerResult.length - 1] as unknown as CustomerFacingDataRecord;

            nextCursor = cursorElement['_nango_metadata']['first_seen_at'] as unknown as string;
            const encodedCursorValue = Buffer.from(`${nextCursor}||${cursorRawElement.id}`).toString('base64');

            return { success: true, error: null, response: { records: customerResult as CustomerFacingDataRecord[], next_cursor: encodedCursorValue } };
        } else {
            return { success: true, error: null, response: { records: customerResult as CustomerFacingDataRecord[], next_cursor: nextCursor } };
        }
    } catch (e: any) {
        const errorMessage = 'List records error';
        await metricsManager.capture(MetricTypes.SYNC_GET_RECORDS_QUERY_TIMEOUT, errorMessage, LogActionEnum.SYNC, {
            environmentId: String(environmentId),
            connectionId,
            providerConfigKey,
            delta: String(delta),
            model,
            error: JSON.stringify(e)
        });

        const error = new Error(errorMessage);
        const nangoError = new NangoError('pass_through_error', error);
        return { success: false, error: nangoError, response: null };
    }
}

export function verifyUniqueKeysAreUnique(data: DataResponse[], optionalUniqueKey?: string | number): { isUnique: boolean; nonUniqueKeys: string[] } {
    const uniqueKey = optionalUniqueKey ?? 'id';
    const idMap: { [key: string]: boolean } = {};
    let isUnique = true;
    const nonUniqueKeys: string[] = [];

    for (let i = 0; i < data.length; i++) {
        const item = data[i] as DataResponse;
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

export async function deleteRecordsBySyncId(sync_id: string): Promise<void> {
    await schema().from<SyncDataRecord>('_nango_sync_data_records').where({ sync_id }).del();
    await schema().from<SyncDataRecord>('_nango_sync_data_records_deletes').where({ sync_id }).del();
}

export async function getSingleRecord(external_id: string, nango_connection_id: number, model: string): Promise<SyncDataRecord | null> {
    const encryptedRecord = await schema().from<SyncDataRecord>('_nango_sync_data_records').where({
        nango_connection_id,
        model,
        external_id
    });

    if (!encryptedRecord) {
        return null;
    }

    const result = encryptionManager.decryptDataRecords(encryptedRecord, 'json');

    if (!result || result.length === 0) {
        return null;
    }

    return result[0] as unknown as SyncDataRecord;
}

export async function getRecordsByExternalIds(external_ids: string[], nango_connection_id: number, model: string): Promise<SyncDataRecord[]> {
    const encryptedRecords = await schema()
        .from<SyncDataRecord>('_nango_sync_data_records')
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
