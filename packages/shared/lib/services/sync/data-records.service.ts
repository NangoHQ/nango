import md5 from 'md5';
import * as uuid from 'uuid';
import dayjs from 'dayjs';

import type { DataRecord as SyncDataRecord } from '../../models/Sync.js';
import type { DataResponse } from '../../models/Data.js';
import { schema } from '../../db/database.js';
import connectionService from '../connection.service.js';

export const formatDataRecords = (
    records: DataResponse[],
    nango_connection_id: number,
    model: string,
    syncId: string,
    sync_job_id: number
): SyncDataRecord[] => {
    return records.map((record: DataResponse) => {
        const data_hash = md5(JSON.stringify(record));
        const external_id = record['id'] as string;

        return {
            id: uuid.v4(),
            json: record,
            external_id,
            data_hash,
            model,
            nango_connection_id,
            sync_id: syncId,
            sync_job_id
        };
    });
};

export async function getDataRecords(
    connectionId: string,
    providerConfigKey: string,
    environmentId: number,
    model: string,
    delta: string,
    offset: number | string,
    limit: number | string
): Promise<Pick<SyncDataRecord, 'json'>[] | null> {
    const nangoConnection = await connectionService.getConnection(connectionId, providerConfigKey, environmentId);

    if (!nangoConnection) {
        throw new Error(`No connection found for connectionId ${connectionId} and providerConfigKey ${providerConfigKey}`);
    }

    let query = schema()
        .from<SyncDataRecord>(`_nango_sync_data_records`)
        .where({ nango_connection_id: Number(nangoConnection.id), model });

    if (offset) {
        query = query.offset(Number(offset));
    }

    if (limit) {
        query = query.limit(Number(limit));
    }

    if (delta) {
        const time = dayjs(delta).toDate();
        const utcString = time.toUTCString();
        query = query.andWhere('updated_at', '>=', utcString);
    }

    const result = (await query.pluck('json')) as Pick<SyncDataRecord, 'json'>[];

    return result;
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
