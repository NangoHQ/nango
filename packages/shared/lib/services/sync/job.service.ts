import { schema, dbNamespace } from '../../db/database.js';
import type { Job as SyncJob, SyncStatus, SyncType, SyncResult } from '../../models/Sync.js';

const SYNC_JOB_TABLE = dbNamespace + 'sync_jobs';

export const createSyncJob = async (
    sync_id: string,
    type: SyncType,
    status: SyncStatus,
    job_id: string,
    activity_log_id: number,
    result?: SyncResult
): Promise<Pick<SyncJob, 'id'> | null> => {
    const job: SyncJob = {
        sync_id,
        type,
        status,
        job_id,
        activity_log_id
    };

    if (result) {
        job.result = result;
    }

    const syncJob = await schema().from<SyncJob>(SYNC_JOB_TABLE).insert(job).returning('id');

    if (syncJob && syncJob.length > 0 && syncJob[0]) {
        return syncJob[0];
    }

    return null;
};

export const updateJobActivityLogId = async (id: number, activity_log_id: number): Promise<void> => {
    return schema().from<SyncJob>(SYNC_JOB_TABLE).where({ id }).update({
        activity_log_id
    });
};

export const getLatestSyncJob = async (sync_id: string): Promise<SyncJob | null> => {
    const result = await schema().from<SyncJob>(SYNC_JOB_TABLE).where({ sync_id }).orderBy('created_at', 'desc').first();

    if (result) {
        return result;
    }

    return null;
};

export const updateSyncJobStatus = async (id: number, status: SyncStatus): Promise<void> => {
    return schema().from<SyncJob>(SYNC_JOB_TABLE).where({ id }).update({
        status
    });
};

/**
 * Update Sync Job Result
 * @desc grab any existing results and add them to the current
 */
export const updateSyncJobResult = async (id: number, result: SyncResult): Promise<SyncResult> => {
    const { result: existingResult } = await schema().from<SyncJob>(SYNC_JOB_TABLE).select('result').where({ id }).first();

    if (!existingResult || Object.keys(existingResult).length === 0) {
        await schema().from<SyncJob>(SYNC_JOB_TABLE).where({ id }).update({
            result
        });

        return result;
    } else {
        const { added, updated, deleted } = existingResult || { added: 0, updated: 0, deleted: 0 };

        const finalResult = {
            added: Number(added) + Number(result.added),
            updated: Number(updated) + Number(result.updated),
            deleted: deleted ? deleted + result.deleted : result.deleted
        };

        await schema().from<SyncJob>(SYNC_JOB_TABLE).where({ id }).update({
            result: finalResult
        });

        return finalResult;
    }
};

export const addSyncConfigToJob = async (id: number, sync_config_id: number): Promise<void> => {
    await schema().from<SyncJob>(SYNC_JOB_TABLE).where({ id }).update({
        sync_config_id
    });
};
