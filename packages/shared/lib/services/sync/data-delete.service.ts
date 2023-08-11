import { schema } from '../../db/database.js';
import type { DataRecord } from '../../models/Sync.js';

const table = '_nango_sync_data_records_deletes';

export const getDeletedKeys = async (records: DataRecord[], dbTable: string, uniqueKey: string, nangoConnectionId: number, model: string) => {
    console.log(records);
    console.log(table);
    console.log(schema);
    console.log(dbTable);
    console.log(uniqueKey);
    console.log(nangoConnectionId);
    console.log(model);

    return [];
};
