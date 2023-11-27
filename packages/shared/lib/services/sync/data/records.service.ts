import md5 from 'md5';
import * as uuid from 'uuid';
import dayjs from 'dayjs';

import type {
    DataRecord as SyncDataRecord,
    RecordWrapCustomerFacingDataRecord,
    CustomerFacingDataRecord,
    DataRecordWithMetadata
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

    let sort = 'external_id';

    switch (sortBy) {
        case 'updated_at':
            sort = 'updated_at';
            break;
        case 'created_at':
            sort = 'created_at';
            break;
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
