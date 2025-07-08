import db, { dbNamespace } from '@nangohq/database';

import { SyncStatus } from '../../models/Sync.js';
import { LogActionEnum } from '../../models/Telemetry.js';
import errorManager, { ErrorSourceEnum } from '../../utils/error.manager.js';

import type { Job as SyncJob, SyncJobsType, SyncResultByModel } from '../../models/Sync.js';
import type { ConnectionJobs } from '@nangohq/types';

const SYNC_JOB_TABLE = dbNamespace + 'sync_jobs';

export async function createSyncJob({
    sync_id,
    type,
    status,
    job_id,
    nangoConnection,
    sync_config_id,
    run_id,
    log_id
}: {
    sync_id: string;
    type: SyncJobsType;
    status: SyncStatus;
    job_id: string;
    nangoConnection: ConnectionJobs | null;
    sync_config_id?: number;
    run_id?: string;
    log_id?: string;
}): Promise<SyncJob | null> {
    const job: Partial<SyncJob> = {
        sync_id,
        type,
        status,
        job_id,
        ...(run_id ? { run_id } : {}),
        ...(log_id ? { log_id: log_id } : {})
    };
    if (sync_config_id) {
        job.sync_config_id = sync_config_id;
    }

    try {
        const syncJob = await db.knex.from<SyncJob>(SYNC_JOB_TABLE).insert(job).returning('*');

        if (syncJob && syncJob.length > 0 && syncJob[0]) {
            return syncJob[0];
        }
    } catch (err) {
        if (nangoConnection) {
            errorManager.report(err, {
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
}

export const getLatestSyncJob = async (sync_id: string): Promise<SyncJob | null> => {
    const result = await db.knex.from<SyncJob>(SYNC_JOB_TABLE).select('*').where({ sync_id }).orderBy('created_at', 'desc').first();

    if (result) {
        return result;
    }

    return null;
};

export const getSyncJobByRunId = async (run_id: string): Promise<SyncJob | null> => {
    const result = await db.knex.from<SyncJob>(SYNC_JOB_TABLE).select('*').where({ run_id }).first();

    if (result) {
        return result;
    }

    return null;
};

export const updateSyncJobStatus = async (id: number, status: SyncStatus): Promise<SyncJob | null> => {
    const [job] = await db.knex
        .from<SyncJob>(SYNC_JOB_TABLE)
        .where({ id })
        .update({
            status,
            updated_at: new Date()
        })
        .returning('*');
    return job || null;
};

/**
 * Update Sync Job Result
 * @desc grab any existing results and add them to the current
 */
export const updateSyncJobResult = async (id: number, result: SyncResultByModel, model: string): Promise<SyncJob> => {
    return await db.knex.transaction(async (trx) => {
        const row = await trx.from<SyncJob>(SYNC_JOB_TABLE).select<Pick<SyncJob, 'result'>>('result').forUpdate().where({ id }).first();
        if (!row) {
            throw new Error('Failed to query sync job');
        }

        const { result: existingResult } = row;
        if (!existingResult || Object.keys(existingResult).length === 0) {
            const [updatedRow] = await trx
                .from<SyncJob>(SYNC_JOB_TABLE)
                .where({ id })
                .update({
                    result
                })
                .returning('*');

            return updatedRow as SyncJob;
        } else {
            const { added, updated, deleted } = existingResult[model] || { added: 0, updated: 0, deleted: 0 };

            const incomingResult = result[model];
            const deletedValue = Number(deleted) || 0;
            const incomingDeletedValue = Number(incomingResult?.deleted) || 0;
            const finalResult: SyncResultByModel = {
                ...existingResult,
                [model]: {
                    added: Number(added) + Number(incomingResult?.added),
                    updated: Number(updated) + Number(incomingResult?.updated),
                    deleted: deletedValue + incomingDeletedValue
                }
            };

            const [updatedRow] = await trx
                .from<SyncJob>(SYNC_JOB_TABLE)
                .where({ id })
                .update({
                    result: finalResult
                })
                .returning('*');

            return updatedRow as SyncJob;
        }
    });
};

export const isSyncJobRunning = async (sync_id: string): Promise<Pick<SyncJob, 'id' | 'job_id' | 'run_id' | 'log_id'> | null> => {
    const result = await db.knex
        .from<SyncJob>(SYNC_JOB_TABLE)
        .select('*')
        .where({
            sync_id,
            status: SyncStatus.RUNNING
        })
        .orderBy('created_at', 'desc')
        .first();

    return result || null;
};

export async function hardDeleteJobs({ syncId, limit }: { syncId: string; limit: number }): Promise<number> {
    return db.knex
        .from<SyncJob>('_nango_sync_jobs')
        .delete()
        .whereIn('id', function (sub) {
            sub.select('id').from<SyncJob>('_nango_sync_jobs').where({ sync_id: syncId }).limit(limit);
        });
}

export async function deleteJobsByDate({ olderThan, limit }: { olderThan: number; limit: number }): Promise<number> {
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - olderThan);

    return db.knex
        .from<SyncJob>('_nango_sync_jobs')
        .delete()
        .whereIn('id', function (sub) {
            sub.select('id').from<SyncJob>('_nango_sync_jobs').where('created_at', '<=', dateThreshold.toISOString()).limit(limit);
        });
}
