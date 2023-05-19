import md5 from 'md5';
import * as uuid from 'uuid';

import type { SyncDataRecord } from '../models/SyncDataRecord.js';
import type { DataResponse } from '../models/Data.js';

export const formatDataRecords = (records: SyncDataRecord[], nango_connection_id: number, model: string): DataResponse[] => {
    return records.map((record: SyncDataRecord) => {
        const data_hash = md5(JSON.stringify(record));
        const external_id = record['id'] as string;

        return {
            id: uuid.v4(),
            json: record,
            external_id,
            data_hash,
            model,
            nango_connection_id
        };
    });
};
