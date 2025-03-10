import get from 'lodash-es/get.js';
import { environmentService, connectionService, getSyncConfigsByConfigIdForWebhook } from '@nangohq/shared';
import type { Config as ProviderConfig } from '@nangohq/shared';
import type { LogContextGetter } from '@nangohq/logs';
import { getOrchestrator } from '../utils/utils.js';
import type { DBConnectionDecrypted, DBSyncConfig } from '@nangohq/types';

export interface InternalNango {
    getWebhooks: (environment_id: number, nango_config_id: number) => Promise<DBSyncConfig[]>;
    executeScriptForWebhooks(
        integration: ProviderConfig,
        body: Record<string, any>,
        webhookType: string,
        connectionIdentifier: string,
        logContextGetter: LogContextGetter,
        propName?: string
    ): Promise<{ connectionIds: string[] }>;
}

export const internalNango: InternalNango = {
    getWebhooks: async (environment_id, nango_config_id) => {
        return await getSyncConfigsByConfigIdForWebhook(environment_id, nango_config_id);
    },
    executeScriptForWebhooks: async (
        integration,
        body,
        webhookType,
        connectionIdentifier,
        logContextGetter,
        propName
    ): Promise<{ connectionIds: string[] }> => {
        if (!get(body, connectionIdentifier)) {
            return { connectionIds: [] };
        }

        let connections: DBConnectionDecrypted[] | null = null;
        if (propName === 'connectionId') {
            const { success, response: connection } = await connectionService.getConnection(
                get(body, connectionIdentifier),
                integration.unique_key,
                integration.environment_id
            );

            if (success && connection) {
                connections = [connection];
            }
        } else if (propName && propName.includes('metadata.')) {
            const strippedMetadata = propName.replace('metadata.', '');
            connections = await connectionService.findConnectionsByMetadataValue({
                metadataProperty: strippedMetadata,
                payloadIdentifier: get(body, connectionIdentifier),
                configId: integration.id,
                environmentId: integration.environment_id
            });
        } else {
            connections = await connectionService.findConnectionsByConnectionConfigValue(
                propName || connectionIdentifier,
                get(body, connectionIdentifier),
                integration.environment_id
            );
        }

        if (!connections || connections.length === 0) {
            return { connectionIds: [] };
        }

        const syncConfigsWithWebhooks = await internalNango.getWebhooks(integration.environment_id, integration.id as number);

        if (syncConfigsWithWebhooks.length <= 0) {
            return { connectionIds: connections?.map((connection) => connection.connection_id) };
        }

        const { account, environment } = (await environmentService.getAccountAndEnvironment({ environmentId: integration.environment_id }))!;

        const type = get(body, webhookType);

        const orchestrator = getOrchestrator();

        for (const syncConfig of syncConfigsWithWebhooks) {
            const { webhook_subscriptions } = syncConfig;

            if (!webhook_subscriptions) {
                continue;
            }

            for (const webhook of webhook_subscriptions) {
                if (type === webhook) {
                    for (const connection of connections) {
                        await orchestrator.triggerWebhook({
                            account,
                            environment,
                            integration,
                            connection,
                            webhookName: webhook,
                            syncConfig,
                            input: body,
                            logContextGetter
                        });
                    }
                }
            }
        }

        return { connectionIds: connections.map((connection) => connection.connection_id) };
    }
};
