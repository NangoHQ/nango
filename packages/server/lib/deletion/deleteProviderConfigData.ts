import db from '@nangohq/database';
import { configService, functionConfigService } from '@nangohq/shared';

import { batchDelete } from './batchDelete.js';
import { deleteConnectionData } from './deleteConnectionData.js';
import { deleteFunctionConfigData } from './deleteFunctionConfigData.js';
import { deleteSyncConfigData } from './deleteSyncConfigData.js';

import type { BatchDeleteSharedOptions } from './batchDelete.js';
import type { DBConnection, DBOnEventScript, DBSyncConfig, IntegrationConfig } from '@nangohq/types';

export async function deleteProviderConfigData(providerConfig: IntegrationConfig, opts: BatchDeleteSharedOptions) {
    if (!providerConfig.id) {
        return;
    }
    const providerConfigId = providerConfig.id;

    const { logger, deadline, limit } = opts;
    logger.info('Deleting provider config...', { providerConfigId: providerConfig.id, uniqueKey: providerConfig.unique_key });

    await batchDelete({
        ...opts,
        name: 'functionConfigs < providerConfigs',
        deleteFn: async () => {
            const functionConfigs = await functionConfigService.rows(
                db.knex,
                { environmentId: providerConfig.environment_id, integrationId: providerConfigId },
                { includeDeleted: true, limit }
            );
            if (functionConfigs.isErr()) {
                throw functionConfigs.error;
            }

            for (const functionConfig of functionConfigs.value) {
                await deleteFunctionConfigData(functionConfig, opts);
            }

            return functionConfigs.value.length;
        }
    });

    await batchDelete({
        name: 'syncConfigs < providerConfigs',
        deadline,
        limit,
        logger,
        deleteFn: async () => {
            const syncConfigs = await db.knex.from<DBSyncConfig>('_nango_sync_configs').where({ nango_config_id: providerConfigId }).limit(opts.limit);

            for (const syncConfig of syncConfigs || []) {
                await deleteSyncConfigData({ syncConfigId: syncConfig.id, environmentId: syncConfig.environment_id, models: syncConfig.models }, opts);
            }

            return syncConfigs?.length || 0;
        }
    });

    await batchDelete({
        ...opts,
        name: 'connections < providerConfigs',
        deleteFn: async () => {
            const connections = await db.knex.from<DBConnection>('_nango_connections').where({ config_id: providerConfigId }).limit(opts.limit);

            for (const connection of connections) {
                await deleteConnectionData(connection, opts);
            }

            return connections.length;
        }
    });

    await batchDelete({
        ...opts,
        name: 'on_event_scripts < providerConfig',
        deleteFn: async () => {
            const onEventScriptsDeletedCount = await db.knex.from<DBOnEventScript>('on_event_scripts').where({ config_id: providerConfigId }).delete();

            return onEventScriptsDeletedCount;
        }
    });

    await configService.hardDelete(providerConfigId);
}
