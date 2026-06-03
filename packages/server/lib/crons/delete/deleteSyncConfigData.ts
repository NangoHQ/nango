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
 * Deletes a function and its dependencies. A function spans multiple `_nango_sync_config` **versions**
 * (same `nango_config_id` + `sync_name`); deleting it removes the whole history, not just the version
 * we were handed — otherwise the inactive history rows linger forever (the retention cron only reaps
 * `deleted` rows) while their S3 files are already gone (artifacts are deleted for all versions).
 *
 * The version set is this row plus every **inactive** (`active = false`) sibling. We deliberately
 * exclude any *other* `active` version: redeploying a function with the same name after a delete
 * creates a fresh active row, and the still-soft-deleted old row must not drag the live one down with
 * it when the cron eventually reaps it.
 *
 * Per version, same-datastore children — syncs (paged → `deleteSyncData`) and endpoints — are deleted
 * inline; the S3 artifacts are dispatched as one `deleteArtifacts` task (their keys span all versions
 * and are captured here, while the rows still exist). The handed-in row is hard-deleted **last**, so an
 * interrupted run leaves it present and resumable.
 */
export async function deleteSyncConfigData({ syncConfigId, environmentId, models }: DeleteSyncConfigInput, opts: BatchDeleteSharedOptions) {
    const { logger, deadline, limit, sleepMs } = opts;
    logger.info('Deleting sync config...', syncConfigId);

    const target = await db.knex.from<DBSyncConfig>('_nango_sync_configs').select('nango_config_id', 'sync_name').where({ id: syncConfigId }).first();

    // The handed-in row + inactive history; never another live active version (a redeploy of the name).
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
