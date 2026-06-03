import db from '@nangohq/database';
import { getFunctionFileLocations, hardDeleteEndpoints, hardDeleteSyncConfig } from '@nangohq/shared';

import { batchDelete } from './batchDelete.js';
import { deleteSyncData } from './deleteSyncData.js';
import { taskQueue } from '../../tasks/index.js';

import type { BatchDeleteSharedOptions } from './batchDelete.js';
import type { Sync } from '@nangohq/shared';
import type { DBSyncConfig } from '@nangohq/types';

export interface DeleteSyncConfigInput {
    syncConfigId: number;
    environmentId: number;
    models: string[];
}

/**
 * Hard deletes any sync_config dependency, then hard deletes the sync_config itself.
 * Does the same other historical inactive `sync_config` rows.
 *
 * Works up to the provided time deadline.
 */
export async function deleteSyncConfigData({ syncConfigId, environmentId, models }: DeleteSyncConfigInput, opts: BatchDeleteSharedOptions) {
    const { logger, deadline, limit, sleepMs } = opts;
    logger.info('Deleting sync config...', syncConfigId);

    const target = await db.knex.from<DBSyncConfig>('_nango_sync_configs').select('nango_config_id', 'sync_name').where({ id: syncConfigId }).first();

    // The handed-in row + inactive history
    const versions: Pick<DBSyncConfig, 'id' | 'models'>[] = target
        ? await db.knex
              .from<DBSyncConfig>('_nango_sync_configs')
              .select('id', 'models')
              .where({ nango_config_id: target.nango_config_id, sync_name: target.sync_name })
              .andWhere((qb) => qb.where({ active: false }).orWhere({ id: syncConfigId }))
        : [{ id: syncConfigId, models }];

    for (const version of versions) {
        await batchDelete({
            name: 'syncs < sync_config',
            deadline,
            limit,
            logger,
            sleepMs,
            deleteFn: async () => {
                const syncs = await db.knex.from<Sync>('_nango_syncs').select('id', 'nango_connection_id').where({ sync_config_id: version.id }).limit(limit);

                for (const sync of syncs) {
                    await deleteSyncData({ syncId: sync.id, nangoConnectionId: sync.nango_connection_id, environmentId, models: version.models }, opts);
                }

                return syncs.length;
            }
        });

        const delEndpoints = await hardDeleteEndpoints({ syncConfigId: version.id });
        if (delEndpoints) {
            logger.info('deleted', delEndpoints, 'endpoints');
        }
    }

    // Capture artifact keys while the rows still exist (covers every version), then dispatch their (S3) deletion.
    const fileLocations = await getFunctionFileLocations(syncConfigId);
    const res = await taskQueue.enqueue('deleteArtifacts', { environmentId, fileLocations });
    if (res.isErr()) {
        throw res.error;
    }

    // Hard-delete the inactive siblings first, then the handed-in row last (the resumability anchor).
    for (const version of versions) {
        if (version.id !== syncConfigId) {
            await hardDeleteSyncConfig(version.id);
        }
    }
    await hardDeleteSyncConfig(syncConfigId);
}
