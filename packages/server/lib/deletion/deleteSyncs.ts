import db from '@nangohq/database';
import { getLatestSyncJob, hardDeleteJobs, hardDeleteSync } from '@nangohq/shared';

import { tasks } from '../tasks/index.js';
import { getOrchestrator } from '../utils/utils.js';
import { batchDelete } from './batchDelete.js';

import type { BatchDeleteSharedOptions } from './batchDelete.js';
import type { ActiveLog } from '@nangohq/types';

const orchestrator = getOrchestrator();

const UNSCHEDULE_BATCH_SIZE = 1000;

export interface DeleteSyncInput {
    id: string;
    nangoConnectionId: number;
    /** null when the config is already gone; unschedule and records deletion are skipped for that sync. */
    environmentId: number | null;
    models: string[];
}

/**
 * Self-contained batch deletion of syncs. Unschedules the batch in bulk up-front (grouped by environment,
 * since a schedule name encodes its env) then deletes each sync's jobs and active_logs,
 * dispatches its `deleteRecords` task, and hard-deletes it.
 *
 * Unschedule precedes teardown so a crash leaves the rows to be re-paged and re-unscheduled idempotently.
 */
export async function deleteSyncs(syncs: DeleteSyncInput[], opts: BatchDeleteSharedOptions) {
    const { logger, limit } = opts;
    if (syncs.length === 0) {
        return;
    }

    // Bulk-unschedule, grouped by environment and chunked to the endpoint's per-call limit.
    const syncIdsByEnv = new Map<number, string[]>();
    for (const sync of syncs) {
        if (sync.environmentId === null) {
            continue;
        }
        const ids = syncIdsByEnv.get(sync.environmentId) ?? [];
        ids.push(sync.id);
        syncIdsByEnv.set(sync.environmentId, ids);
    }
    for (const [environmentId, syncIds] of syncIdsByEnv) {
        for (let i = 0; i < syncIds.length; i += UNSCHEDULE_BATCH_SIZE) {
            const res = await orchestrator.deleteSyncs({ syncIds: syncIds.slice(i, i + UNSCHEDULE_BATCH_SIZE), environmentId });
            if (res.isErr()) {
                throw res.error;
            }
        }
    }

    for (const sync of syncs) {
        logger.info('Deleting sync...', sync.id);

        // The generation source. No job → the sync never ran → no records.
        const lastJob = await getLatestSyncJob(sync.id);

        if (sync.environmentId !== null && sync.models.length > 0 && lastJob) {
            const res = await tasks.enqueue('deleteRecords', {
                syncId: sync.id,
                nangoConnectionId: sync.nangoConnectionId,
                environmentId: sync.environmentId,
                models: sync.models,
                generation: lastJob.id + 1
            });
            if (res.isErr()) {
                throw res.error;
            }
        }

        await batchDelete({
            ...opts,
            name: 'sync_jobs < sync',
            deleteFn: () => hardDeleteJobs({ syncId: sync.id, limit })
        });

        await batchDelete({
            ...opts,
            name: 'active_logs < sync',
            deleteFn: async () => {
                return await db.knex
                    .from<ActiveLog>('_nango_active_logs')
                    .whereIn('id', function (sub) {
                        sub.select('id').from<ActiveLog>('_nango_active_logs').where({ sync_id: sync.id }).limit(limit);
                    })
                    .delete();
            }
        });

        await hardDeleteSync(sync.id);
    }
}
