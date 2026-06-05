import db from '@nangohq/database';
import { getLatestSyncJob, hardDeleteJobs, hardDeleteSync } from '@nangohq/shared';

import { batchDelete } from './batchDelete.js';
import { tasks } from '../../tasks/index.js';
import { getOrchestrator } from '../../utils/utils.js';

import type { BatchDeleteSharedOptions } from './batchDelete.js';
import type { ActiveLog } from '@nangohq/types';

const orchestrator = getOrchestrator();

export interface DeleteSyncInput {
    syncId: string;
    nangoConnectionId: number;
    /** null when the config is already gone; unschedule and records deletion are skipped. */
    environmentId: number | null;
    models: string[];
}

/**
 * Deletes a sync and its dependencies: unschedules it, deletes jobs and active_logs inline, and
 * dispatches a `deleteRecords` task carrying `generation` (the sync's latest job id + 1).
 */
export async function deleteSyncData({ syncId, nangoConnectionId, environmentId, models }: DeleteSyncInput, opts: BatchDeleteSharedOptions) {
    const { logger, limit } = opts;
    logger.info('Deleting sync...', syncId);

    // Read before deleting jobs — the generation source. No job → the sync never ran → no records.
    const lastJob = await getLatestSyncJob(syncId);

    if (environmentId !== null) {
        await orchestrator.deleteSync({ syncId, environmentId });
    }

    if (environmentId !== null && models.length > 0 && lastJob) {
        const res = await tasks.enqueue('deleteRecords', { syncId, nangoConnectionId, environmentId, models, generation: lastJob.id + 1 });
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
