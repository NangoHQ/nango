import db from '@nangohq/database';

import type { DBSyncConfig } from '@nangohq/types';

export async function switchActiveSyncConfig(oldSyncConfigId: number): Promise<void> {
    await db.knex.transaction(async (trx) => {
        // mark sync config as inactive
        await trx.from<DBSyncConfig>('_nango_sync_configs').update({ active: false }).where({ id: oldSyncConfigId });

        // update sync_config_id in syncs table to point to active sync config
        await trx.raw(
            `
            UPDATE _nango_syncs
            SET sync_config_id = (
                SELECT active_config.id
                FROM _nango_sync_configs as old_config
                JOIN _nango_sync_configs as active_config
                    ON old_config.sync_name = active_config.sync_name
                    AND old_config.nango_config_id = active_config.nango_config_id
                    AND old_config.environment_id = active_config.environment_id
                WHERE old_config.id = ?
                    AND active_config.active = true
            )
            WHERE sync_config_id = ?`,
            [oldSyncConfigId, oldSyncConfigId]
        );
    });
}
