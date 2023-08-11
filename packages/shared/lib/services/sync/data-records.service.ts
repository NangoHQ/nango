import md5 from 'md5';
import * as uuid from 'uuid';
import dayjs from 'dayjs';

import type { DataRecord as SyncDataRecord } from '../../models/Sync.js';
import type { DataResponse } from '../../models/Data.js';
import type { ServiceResponse } from '../../models/Generic.js';
import db, { schema } from '../../db/database.js';
import connectionService from '../connection.service.js';
import { NangoError } from '../../utils/error.js';

export const formatDataRecords = (
    records: DataResponse[],
    nango_connection_id: number,
    model: string,
    syncId: string,
    sync_job_id: number,
    softDelete = false
): ServiceResponse<SyncDataRecord[]> => {
    const formattedRecords: SyncDataRecord[] = [] as SyncDataRecord[];

    const deletedAtKey = 'deletedAt';

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
            external_deleted_at
        };
    }
    return { success: true, error: null, response: formattedRecords };
};

export async function getDataRecords(
    connectionId: string,
    providerConfigKey: string,
    environmentId: number,
    model: string,
    delta: string,
    offset: number | string,
    limit: number | string,
    sortBy: string,
    order: 'asc' | 'desc',
    filter: 'added' | 'updated' | 'deleted',
    includeMetaData = false
): Promise<ServiceResponse<Pick<SyncDataRecord, 'json'>[] | null>> {
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
        switch (filter) {
            case 'added':
                query = query.andWhere('external_deleted_at', null).andWhere('created_at', '=', db.knex.raw('updated_at'));
                break;
            case 'updated':
                query = query.andWhere('external_deleted_at', null).andWhere('created_at', '!=', db.knex.raw('updated_at'));
                break;
            case 'deleted':
                query = query.andWhere({ external_is_deleted: true });
                break;
        }
    }

    let result;

    if (includeMetaData) {
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
    } else {
        result = (await query.pluck('json')) as Pick<SyncDataRecord, 'json'>[];
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
}
