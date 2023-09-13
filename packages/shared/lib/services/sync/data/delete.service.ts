import db, { schema } from '../../../db/database.js';
import type { DataRecord } from '../../../models/Sync.js';

const RECORDS_TABLE = '_nango_sync_data_records';
const DELETE_RECORDS_TABLE = '_nango_sync_data_records_deletes';

const columns = [
    'id',
    'external_id',
    'json',
    'data_hash',
    'nango_connection_id',
    'model',
    'created_at',
    'updated_at',
    'sync_id',
    'sync_job_id',
    'external_is_deleted',
    'external_deleted_at'
];

export const getDeletedKeys = async (dbTable: string, uniqueKey: string, nangoConnectionId: number, model: string) => {
    const results = await schema()
        .from<DataRecord>(DELETE_RECORDS_TABLE)
        .leftJoin(dbTable, function () {
            this.on(`${dbTable}.${uniqueKey}`, '=', `${DELETE_RECORDS_TABLE}.${uniqueKey}`)
                .andOn(`${dbTable}.nango_connection_id`, '=', db.knex.raw('?', [nangoConnectionId]))
                .andOn(`${dbTable}.model`, '=', db.knex.raw('?', [model]));
        })
        .whereNull(`${dbTable}.${uniqueKey}`)
        .where({
            [`${DELETE_RECORDS_TABLE}.nango_connection_id`]: nangoConnectionId,
            [`${DELETE_RECORDS_TABLE}.model`]: model
        })
        .select(`${DELETE_RECORDS_TABLE}.*`);

    if (!results || results.length === 0) {
        return [];
    }

    const deletedResults = results.map((result: DataRecord) => {
        return {
            ...result,
            external_is_deleted: true,
            external_deleted_at: new Date()
        };
    });

    await schema()
        .from<DataRecord>(RECORDS_TABLE)
        .where({
            nango_connection_id: nangoConnectionId,
            model
        })
        .insert(deletedResults);

    return results.map((result: DataRecord) => result.external_id);
};

export const getFullRecords = async (nangoConnectionId: number, model: string) => {
    const results = await schema().from<DataRecord>(RECORDS_TABLE).where({
        nango_connection_id: nangoConnectionId,
        model
    });

    return results;
};

export const getFullSnapshotRecords = async (nangoConnectionId: number, model: string) => {
    const results = await schema().from<DataRecord>(DELETE_RECORDS_TABLE).where({
        nango_connection_id: nangoConnectionId,
        model
    });

    return results;
};

/**
 * Clear Old Records
 * @desc get the job of the last set of records that were inserted and remove
 * them if any records exist
 */
export const clearOldRecords = async (nangoConnectionId: number, model: string) => {
    const exists = await schema()
        .from<DataRecord>(RECORDS_TABLE)
        .where({
            nango_connection_id: nangoConnectionId,
            model
        })
        .select('id')
        .first();

    if (!exists) {
        return;
    }

    const oldDeleteRecord = await schema()
        .from<DataRecord>(DELETE_RECORDS_TABLE)
        .where({
            nango_connection_id: nangoConnectionId,
            model
        })
        .select('sync_job_id')
        .first();

    if (oldDeleteRecord) {
        const { sync_job_id } = oldDeleteRecord;

        await schema()
            .from<DataRecord>(RECORDS_TABLE)
            .where({
                nango_connection_id: nangoConnectionId,
                model,
                sync_job_id
            })
            .del();
    }
};

/**
 * Take Snapshot
 * @desc given a connection id and model, take a snapshot of the records
 * so it can be used for later comparison to track deletes
 *
 */
export const takeSnapshot = async (nangoConnectionId: number, model: string): Promise<boolean> => {
    try {
        await schema()
            .from<DataRecord>(DELETE_RECORDS_TABLE)
            .where({
                nango_connection_id: nangoConnectionId,
                model
            })
            .del();

        const result = await db.knex.raw(
            `
INSERT INTO nango.${DELETE_RECORDS_TABLE} (${columns.join(', ')})
SELECT ${columns.join(', ')}
FROM nango.${RECORDS_TABLE}
WHERE external_is_deleted = false AND
nango_connection_id = ? AND model = ?
    `,
            [nangoConnectionId, model]
        );

        return Boolean(result);
    } catch (err) {
        return false;
    }
};
