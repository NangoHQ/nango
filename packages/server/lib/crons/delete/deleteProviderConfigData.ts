import db from '@nangohq/database';
import { configService } from '@nangohq/shared';

import { batchDelete } from './batchDelete.js';
import { deleteSyncConfigData } from './deleteSyncConfigData.js';

import type { BatchDeleteSharedOptions } from './batchDelete.js';
import type { DBOnEventScript, DBSyncConfig, IntegrationConfig } from '@nangohq/types';

export async function deleteProviderConfigData(providerConfig: IntegrationConfig, opts: BatchDeleteSharedOptions) {
    if (!providerConfig.id) {
        return;
    }

    const { logger, deadline, limit } = opts;
    logger.info('Deleting provider config...', providerConfig.id, providerConfig.unique_key);

    await batchDelete({
        name: 'syncConfigs < providerConfigs',
        deadline,
        limit,
        logger,
        deleteFn: async () => {
            const syncConfigs = await db.knex.from<DBSyncConfig>('_nango_sync_configs').where({ nango_config_id: providerConfig.id! }).limit(opts.limit);

            for (const syncConfig of syncConfigs || []) {
                await deleteSyncConfigData(syncConfig, opts);
            }

            return syncConfigs?.length || 0;
        }
    });

    await batchDelete({
        ...opts,
        name: 'on_event_scripts < providerConfig',
        deleteFn: async () => {
            const onEventScriptsDeletedCount = await db.knex.from<DBOnEventScript>('on_event_scripts').where({ config_id: providerConfig.id! }).delete();

            return onEventScriptsDeletedCount;
        }
    });

    await configService.hardDelete(providerConfig.id);
}
