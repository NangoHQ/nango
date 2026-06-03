import db from '@nangohq/database';
import { getLatestSyncJob, hardDeleteJobs, hardDeleteSync } from '@nangohq/shared';

import { batchDelete } from './batchDelete.js';
import { taskQueue } from '../../tasks/index.js';
import { getOrchestrator } from '../../utils/utils.js';

import type { BatchDeleteSharedOptions } from './batchDelete.js';
import type { ActiveLog } from '@nangohq/types';

const orchestrator = getOrchestrator();

export interface DeleteSyncInput {
    syncId: string;
    nangoConnectionId: number;
    /** May be 0 for orphan soft-deleted syncs whose config is already gone (unschedule is skipped then). */
    environmentId: number;
    models: string[];
}

/**
 * Deletes a sync and all its dependencies, in FK order. Same-datastore children (jobs, active_logs,
 * the sync row) are deleted inline; the records (separate datastore) are dispatched as a `deleteRecords`
 * task. The orchestrator schedule is stopped up-front (best-effort: idempotent, a no-op when already
 * unscheduled — `orchestrator.deleteSync` self-reports, so we don't fail teardown on it).
 *
 * The records task carries `generation` = the sync's latest job id + 1, so it can use the optimized
 * `deleteOutdatedRecords` path. The job id is read **before** `hardDeleteJobs` removes the jobs, and the
 * task is enqueued **before** any destructive delete — so a failed enqueue retries while both the jobs
 * (the generation source) and the sync row (the FK anchor) still exist.
 */
export async function deleteSyncData({ syncId, nangoConnectionId, environmentId, models }: DeleteSyncInput, opts: BatchDeleteSharedOptions) {
    const { logger, limit } = opts;
    logger.info('Deleting sync...', syncId);

    // Read before deleting jobs (the source of `generation`). No job → the sync never ran → no records.
    const lastJob = await getLatestSyncJob(syncId);

    if (environmentId) {
        await orchestrator.deleteSync({ syncId, environmentId });
    }

    if (models.length > 0 && lastJob) {
        const res = await taskQueue.enqueue('deleteRecords', { syncId, nangoConnectionId, environmentId, models, generation: lastJob.id + 1 });
        if (res.isErr()) {
            throw res.error;
        }
    }

    await batchDelete({
        ...opts,
        name: 'sync_jobs < sync',
        deleteFn: () => hardDeleteJobs({ syncId, limit })
    });

    await batchDelete({
        ...opts,
        name: 'active_logs < sync',
        deleteFn: async () => {
            return await db.knex
                .from<ActiveLog>('_nango_active_logs')
                .whereIn('id', function (sub) {
                    sub.select('id').from<ActiveLog>('_nango_active_logs').where({ sync_id: syncId }).limit(limit);
                })
                .delete();
        }
    });

    await hardDeleteSync(syncId);
}
