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

/**
 * Update Created At
 * @desc using the DELETE_RECORDS_TABLE, update the created_at in the RECORDS_TABLE
 * column using the value in the DELETE_RECORDS_TABLE
 * where those same records exist in the RECORDS_TABLE using the uniqueKey
 */
export const updateCreatedAtForUpdatedRecords = async (nangoConnectionId: number, model: string, uniqueKey: string, updatedKeys: string[]) => {
    const results = await schema()
        .from<DataRecord>(DELETE_RECORDS_TABLE)
        .innerJoin(RECORDS_TABLE, function () {
            this.on(`${DELETE_RECORDS_TABLE}.${uniqueKey}`, '=', `${RECORDS_TABLE}.${uniqueKey}`)
                .andOn(`${DELETE_RECORDS_TABLE}.nango_connection_id`, '=', db.knex.raw('?', [nangoConnectionId]))
                .andOn(`${DELETE_RECORDS_TABLE}.model`, '=', db.knex.raw('?', [model]));
        })
        .select(`${DELETE_RECORDS_TABLE}.id`, `${DELETE_RECORDS_TABLE}.${uniqueKey}`, `${DELETE_RECORDS_TABLE}.created_at`);

    if (!results || results.length === 0) {
        return;
    }

    await Promise.all(
        results.map(async (result: DataRecord) => {
            await schema()
                .from<DataRecord>(RECORDS_TABLE)
                .where({
                    nango_connection_id: nangoConnectionId,
                    model,
                    [uniqueKey]: result[uniqueKey]
                })
                .whereIn(uniqueKey, updatedKeys)
                .update({
                    created_at: result.created_at as Date
                });
        })
    );
};
