import db from '@nangohq/database';
import { hardDeleteEndpoints, hardDeleteSyncConfig } from '@nangohq/shared';

import { batchDelete } from './batchDelete.js';
import { deleteSyncData } from './deleteSyncData.js';

import type { BatchDeleteSharedOptions } from './batchDelete.js';
import type { Sync } from '@nangohq/shared';
import type { DBSyncConfig } from '@nangohq/types';

export async function deleteSyncConfigData(syncConfig: DBSyncConfig, opts: BatchDeleteSharedOptions) {
    const { logger, deadline, limit } = opts;
    logger.info('Deleting sync config...', syncConfig.id, syncConfig.sync_name);

    await batchDelete({
        name: 'syncs',
        deadline,
        limit,
        logger,
        deleteFn: async () => {
            const syncs = await db.knex.from<Sync>('_nango_syncs').select<Sync[]>().where({ sync_config_id: syncConfig.id }).limit(limit);

            for (const sync of syncs) {
                await deleteSyncData(sync, syncConfig, opts);
            }

            return syncs.length;
        }
    });

    const delEndpoints = await hardDeleteEndpoints({ syncConfigId: syncConfig.id });
    if (delEndpoints) {
        logger.info('deleted', delEndpoints, 'endpoints');
    }

    // delete sync_config
    await hardDeleteSyncConfig(syncConfig.id);
}
