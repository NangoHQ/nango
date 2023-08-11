import { schema } from '../../db/database.js';
import type { DataRecord } from '../../models/Sync.js';

const RECORDS_TABLE = '_nango_sync_data_records';
const DELETE_RECORDS_TABLE = '_nango_sync_data_records_deletes';

export const getDeletedKeys = async (records: DataRecord[], dbTable: string, uniqueKey: string, nangoConnectionId: number, model: string) => {
    console.log(records);
    console.log(DELETE_RECORDS_TABLE);
    console.log(schema);
    console.log(dbTable);
    console.log(uniqueKey);
    console.log(nangoConnectionId);
    console.log(model);

    return [];
};

export const getFullRecords = async (nangoConnectionId: number, model: string) => {
    const results = await schema().from<DataRecord>(RECORDS_TABLE).where({
        nango_connection_id: nangoConnectionId,
        model
    });

    return results;
};
