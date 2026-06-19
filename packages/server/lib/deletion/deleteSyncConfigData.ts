import db from '@nangohq/database';
import { getFunctionFileLocations, hardDeleteEndpoints, hardDeleteSyncConfig } from '@nangohq/shared';

import { batchDelete } from './batchDelete.js';
import { deleteSyncs } from './deleteSyncs.js';
import { tasks } from '../tasks/index.js';

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
export async function deleteSyncConfigData({ syncConfigId, environmentId }: DeleteSyncConfigInput, opts: BatchDeleteSharedOptions) {
    const { logger, deadline, limit, sleepMs } = opts;
    logger.info('Deleting sync config...', syncConfigId);

    const target = await db.knex.from<DBSyncConfig>('_nango_sync_configs').select('nango_config_id', 'sync_name', 'type').where({ id: syncConfigId }).first();
    if (!target) {
        return; // already gone (e.g. a sibling version handled by an earlier call)
    }

    // The handed-in row + this function's inactive history
    const versions: Pick<DBSyncConfig, 'id' | 'models'>[] = await db.knex
        .from<DBSyncConfig>('_nango_sync_configs')
        .select('id', 'models')
        .where({ nango_config_id: target.nango_config_id, sync_name: target.sync_name, type: target.type })
        .andWhere((qb) => qb.where({ active: false }).orWhere({ id: syncConfigId }));

    for (const version of versions) {
        await batchDelete({
            name: 'syncs < sync_config',
            deadline,
            limit,
            logger,
            sleepMs,
            deleteFn: async () => {
                const syncs = await db.knex.from<Sync>('_nango_syncs').select('id', 'nango_connection_id').where({ sync_config_id: version.id }).limit(limit);

                await deleteSyncs(
                    syncs.map((sync) => ({ id: sync.id, nangoConnectionId: sync.nango_connection_id, environmentId, models: version.models })),
                    opts
                );

                return syncs.length;
            }
        });

        const delEndpoints = await hardDeleteEndpoints({ syncConfigId: version.id });
        if (delEndpoints) {
            logger.info('deleted endpoints', { count: delEndpoints });
        }
    }

    // Capture artifact keys while the rows still exist (covers every version), then dispatch their (S3) deletion.
    const fileLocations = await getFunctionFileLocations(syncConfigId);
    const res = await tasks.enqueue('deleteArtifacts', { environmentId, fileLocations });
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
