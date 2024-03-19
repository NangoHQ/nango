import db, { schema, dbNamespace } from '../../db/database.js';
import errorManager, { ErrorSourceEnum } from '../../utils/error.manager.js';
import { LogActionEnum } from '../../models/Activity.js';
import type { NangoConnection } from '../../models/Connection.js';
import { Job as SyncJob, SyncStatus, SyncType, SyncResultByModel } from '../../models/Sync.js';

const SYNC_JOB_TABLE = dbNamespace + 'sync_jobs';

const SYNC_TIMEOUT_HOURS = 25;

export const createSyncJob = async (
    sync_id: string,
    type: SyncType,
    status: SyncStatus,
    job_id: string,
    nangoConnection: NangoConnection | null,
    run_id?: string
): Promise<Pick<SyncJob, 'id'> | null> => {
    const job: SyncJob = {
        sync_id,
        type,
        status,
        job_id
    };

    if (run_id) {
        job.run_id = run_id;
    }

    try {
        const syncJob = await schema().from<SyncJob>(SYNC_JOB_TABLE).insert(job).returning('id');

        if (syncJob && syncJob.length > 0 && syncJob[0]) {
            return syncJob[0];
        }
    } catch (e) {
        if (nangoConnection) {
            await errorManager.report(e, {
                environmentId: nangoConnection.environment_id,
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.DATABASE,
                metadata: {
                    sync_id,
                    type,
                    status,
                    job_id,
                    run_id,
                    nangoConnection: JSON.stringify(nangoConnection)
                }
            });
        }
    }

    return null;
};

export const updateRunId = async (id: number, run_id: string): Promise<void> => {
    await schema().from<SyncJob>(SYNC_JOB_TABLE).where({ id, deleted: false }).update({
        run_id
    });
};

export const getLatestSyncJob = async (sync_id: string): Promise<SyncJob | null> => {
    const result = await schema().from<SyncJob>(SYNC_JOB_TABLE).where({ sync_id, deleted: false }).orderBy('created_at', 'desc').first();

    if (result) {
        return result;
    }

    return null;
};

export const updateSyncJobStatus = async (id: number, status: SyncStatus): Promise<void> => {
    return schema().from<SyncJob>(SYNC_JOB_TABLE).where({ id, deleted: false }).update({
        status,
        updated_at: new Date()
    });
};

export const updateLatestJobSyncStatus = async (sync_id: string, status: SyncStatus): Promise<void> => {
    const latestJob = await getLatestSyncJob(sync_id);
    if (latestJob && latestJob.id) {
        updateSyncJobStatus(latestJob.id, status);
    }
};

/**
 * Update Sync Job Result
 * @desc grab any existing results and add them to the current
 */
export const updateSyncJobResult = async (id: number, result: SyncResultByModel, model: string): Promise<SyncJob> => {
    return db.knex.transaction(async (trx) => {
        const { result: existingResult } = await trx.from<SyncJob>(SYNC_JOB_TABLE).select('result').forUpdate().where({ id }).first();

        if (!existingResult || Object.keys(existingResult).length === 0) {
            const [updatedRow] = await trx
                .from<SyncJob>(SYNC_JOB_TABLE)
                .where({ id, deleted: false })
                .update({
                    result
                })
                .returning('*');

            return updatedRow as SyncJob;
        } else {
            const { added, updated, deleted } = existingResult[model] || { added: 0, updated: 0, deleted: 0 };

            const incomingResult = result[model];
            const finalResult = {
                ...existingResult,
                [model]: {
                    added: Number(added) + Number(incomingResult?.added),
                    updated: Number(updated) + Number(incomingResult?.updated)
                }
            };

            const deletedValue = Number(deleted) || 0;
            const incomingDeletedValue = Number(incomingResult?.deleted) || 0;

            if (deletedValue !== 0 || incomingDeletedValue !== 0) {
                finalResult[model].deleted = deletedValue + incomingDeletedValue;
            }

            const [updatedRow] = await trx
                .from<SyncJob>(SYNC_JOB_TABLE)
                .where({ id, deleted: false })
                .update({
                    result: finalResult
                })
                .returning('*');

            return updatedRow as SyncJob;
        }
    });
};

export const addSyncConfigToJob = async (id: number, sync_config_id: number): Promise<void> => {
    await schema().from<SyncJob>(SYNC_JOB_TABLE).where({ id, deleted: false }).update({
        sync_config_id
    });
};

export const isSyncJobRunning = async (sync_id: string): Promise<Pick<SyncJob, 'id' | 'job_id' | 'run_id'> | null> => {
    const result = await schema()
        .from<SyncJob>(SYNC_JOB_TABLE)
        .where({
            sync_id,
            deleted: false,
            status: SyncStatus.RUNNING
        })
        .orderBy('created_at', 'desc')
        .limit(1);

    if (result && result.length > 0) {
        return result[0];
    }

    return null;
};

export const isInitialSyncStillRunning = async (sync_id: string): Promise<boolean> => {
    const result = await schema()
        .from<SyncJob>(SYNC_JOB_TABLE)
        .where({
            sync_id,
            deleted: false,
            type: SyncType.INITIAL,
            status: SyncStatus.RUNNING
        })
        .first();

    // if it has been running for more than 24 hours then we should assume it is stuck
    const moreThan24Hours =
        result && result.updated_at ? new Date(result.updated_at).getTime() < new Date().getTime() - SYNC_TIMEOUT_HOURS * 60 * 60 * 1000 : false;

    if (result && !moreThan24Hours) {
        return true;
    }

    return false;
};

export async function softDeleteJobs({ syncId, limit }: { syncId: string; limit: number }): Promise<number> {
    return db
        .knex('_nango_sync_jobs')
        .update({
            deleted: true,
            deleted_at: db.knex.fn.now()
        })
        .whereIn('id', function (sub) {
            sub.select('id').from('_nango_sync_jobs').where({ deleted: false, sync_id: syncId }).limit(limit);
        });
}
