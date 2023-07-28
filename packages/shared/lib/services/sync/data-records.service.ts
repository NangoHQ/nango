import md5 from 'md5';
import * as uuid from 'uuid';
import dayjs from 'dayjs';

import type { DataRecord as SyncDataRecord } from '../../models/Sync.js';
import type { DataResponse } from '../../models/Data.js';
import type { ServiceResponse } from '../../models/Generic.js';
import { schema } from '../../db/database.js';
import connectionService from '../connection.service.js';
import { NangoError } from '../../utils/error.js';

export const formatDataRecords = (
    records: DataResponse[],
    nango_connection_id: number,
    model: string,
    syncId: string,
    sync_job_id: number
): ServiceResponse<SyncDataRecord[]> => {
    const formattedRecords: SyncDataRecord[] = [] as SyncDataRecord[];

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

        const external_id = record['id'] as string;
        formattedRecords[i] = {
            id: uuid.v4(),
            json: record,
            external_id,
            data_hash,
            model,
            nango_connection_id,
            sync_id: syncId,
            sync_job_id
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
    limit: number | string
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

    let query = schema()
        .from<SyncDataRecord>(`_nango_sync_data_records`)
        .where({ nango_connection_id: Number(nangoConnection.id), model });

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

    const result = (await query.pluck('json')) as Pick<SyncDataRecord, 'json'>[];

    return { success: true, error: null, response: result };
}

export function verifyUniqueKeysAreUnique(data: DataResponse[], optionalUniqueKey?: string | number): { isUnique: boolean; nonUniqueKey?: string | number } {
    const uniqueKey = optionalUniqueKey ?? 'id';
    const idMap: { [key: string]: boolean } = {};
    let isUnique = true;
    let nonUniqueKey: string | number = '';

    for (let i = 0; i < data.length; i++) {
        const item = data[i] as DataResponse;
        const id = item[uniqueKey] as string | number;

        if (idMap[id]) {
            isUnique = false;
            nonUniqueKey = id;
            break;
        }

        idMap[id] = true;
    }

    return { isUnique, nonUniqueKey };
}

export async function deleteRecordsBySyncId(sync_id: string): Promise<void> {
    await schema().from<SyncDataRecord>('_nango_sync_data_records').where({ sync_id }).del();
}
