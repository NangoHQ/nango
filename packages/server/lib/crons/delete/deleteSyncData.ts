import db from '@nangohq/database';
import { records } from '@nangohq/records';
import { hardDeleteJobs, hardDeleteSync } from '@nangohq/shared';

import { batchDelete } from './batchDelete.js';

import type { BatchDeleteSharedOptions } from './batchDelete.js';
import type { Sync } from '@nangohq/shared';
import type { ActiveLog, DBSyncConfig } from '@nangohq/types';

export async function deleteSyncData(sync: Sync, syncConfig: DBSyncConfig, opts: BatchDeleteSharedOptions) {
    const { logger, deadline, limit } = opts;
    logger.info('Deleting sync...', sync.id, sync.name);

    await batchDelete({
        ...opts,
        name: 'sync_jobs < sync',
        deleteFn: async () => {
            const syncJobs = await hardDeleteJobs({ syncId: sync.id, limit });
            return syncJobs;
        }
    });

    await batchDelete({
        ...opts,
        name: 'active_logs < sync',
        deleteFn: async () => {
            const activeLogs = await db.knex.from<ActiveLog>('_nango_active_logs').where({ sync_id: sync.id }).limit(limit).delete();
            return activeLogs;
        }
    });

    for (const model of syncConfig.models) {
        // delete records for each model
        await batchDelete({
            name: 'records < sync',
            deadline,
            limit,
            logger,
            deleteFn: async () => {
                const res = await records.deleteRecordsBySyncId({
                    connectionId: sync.nango_connection_id,
                    environmentId: syncConfig.environment_id,
                    model,
                    syncId: sync.id,
                    batchSize: limit
                });
                if (res.totalDeletedRecords) {
                    logger.info('deleted', res.totalDeletedRecords, 'records for model', model);
                }

                return res.totalDeletedRecords;
            }
        });
    }

    // delete sync
    await hardDeleteSync(sync.id);
}
