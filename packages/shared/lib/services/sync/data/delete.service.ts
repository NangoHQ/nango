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
    const results = await schema().from<DataRecord>(RECORDS_TABLE).select(columns).where({
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

export const markRecordsForDeletion = async (nangoConnectionId: number, model: string) => {
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
            .update({
                pending_delete: true
            });
    }
};

/**
 * Clear Old Records
 * @desc clear out any records that are marked for deletion
 * so that the delete accounting can be done correctly
 */
export const clearOldRecords = async (nangoConnectionId: number, model: string) => {
    await schema()
        .from<DataRecord>(RECORDS_TABLE)
        .where({
            nango_connection_id: nangoConnectionId,
            model,
            pending_delete: true
        })
        .del();
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
export const syncUpdateAtForChangedRecords = async (nangoConnectionId: number, model: string, uniqueKey: string, updatedKeys: string[]) => {
    if (updatedKeys.length === 0) {
        return;
    }

    await schema()
        .from<DataRecord>(RECORDS_TABLE)
        .where({
            nango_connection_id: nangoConnectionId,
            model
        })
        .whereIn(uniqueKey, updatedKeys)
        .update({
            updated_at: new Date()
        });
};

export const syncCreatedAtForAddedRecords = async (nangoConnectionId: number, model: string, uniqueKey: string, addedKeys: string[]) => {
    if (addedKeys.length === 0) {
        return;
    }

    await schema()
        .from<DataRecord>(RECORDS_TABLE)
        .where({
            nango_connection_id: nangoConnectionId,
            model
        })
        .whereIn(uniqueKey, addedKeys)
        .update({
            created_at: new Date(),
            updated_at: new Date()
        });
};

export const syncUpdateAtForDeletedRecords = async (nangoConnectionId: number, model: string, uniqueKey: string, deletedKeys: string[]) => {
    if (deletedKeys.length === 0) {
        return;
    }

    await schema()
        .from<DataRecord>(RECORDS_TABLE)
        .where({
            nango_connection_id: nangoConnectionId,
            model
        })
        .whereIn(uniqueKey, deletedKeys)
        .update({
            updated_at: new Date()
        });
};
