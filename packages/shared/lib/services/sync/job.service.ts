import { schema, dbNamespace } from '../../db/database.js';
import errorManager, { ErrorSourceEnum } from '../../utils/error.manager.js';
import { LogActionEnum } from '../../models/Activity.js';
import type { NangoConnection } from '../../models/Connection.js';
import { Job as SyncJob, SyncStatus, SyncType, SyncResultByModel } from '../../models/Sync.js';

const SYNC_JOB_TABLE = dbNamespace + 'sync_jobs';

export const createSyncJob = async (
    sync_id: string,
    type: SyncType,
    status: SyncStatus,
    job_id: string,
    nangoConnection: NangoConnection | null
): Promise<Pick<SyncJob, 'id'> | null> => {
    const job: SyncJob = {
        sync_id,
        type,
        status,
        job_id
    };

    try {
        const syncJob = await schema().from<SyncJob>(SYNC_JOB_TABLE).insert(job).returning('id');

        if (syncJob && syncJob.length > 0 && syncJob[0]) {
            return syncJob[0];
        }
    } catch (e) {
        if (nangoConnection) {
            await errorManager.report(e, {
                environmentId: nangoConnection.environment_id as number,
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.DATABASE,
                metadata: {
                    sync_id,
                    type,
                    status,
                    job_id,
                    nangoConnection: JSON.stringify(nangoConnection)
                }
            });
        }
    }

    return null;
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

/**
 * Update Sync Job Result
 * @desc grab any existing results and add them to the current
 */
export const updateSyncJobResult = async (id: number, result: SyncResultByModel, model: string): Promise<SyncJob> => {
    const { result: existingResult } = await schema().from<SyncJob>(SYNC_JOB_TABLE).select('result').where({ id }).first();

    if (!existingResult || Object.keys(existingResult).length === 0) {
        const [updatedRow] = await schema()
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
                updated: Number(updated) + Number(incomingResult?.updated),
                deleted: Number(deleted) + Number(incomingResult?.deleted)
            }
        };

        const [updatedRow] = await schema()
            .from<SyncJob>(SYNC_JOB_TABLE)
            .where({ id, deleted: false })
            .update({
                result: finalResult
            })
            .returning('*');

        return updatedRow as SyncJob;
    }
};

export const addSyncConfigToJob = async (id: number, sync_config_id: number): Promise<void> => {
    await schema().from<SyncJob>(SYNC_JOB_TABLE).where({ id, deleted: false }).update({
        sync_config_id
    });
};

export const deleteJobsBySyncId = async (sync_id: string): Promise<void> => {
    await schema().from<SyncJob>(SYNC_JOB_TABLE).where({ sync_id, deleted: false }).update({ deleted: true, deleted_at: new Date() });
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

    if (result) {
        return true;
    }

    return false;
};
