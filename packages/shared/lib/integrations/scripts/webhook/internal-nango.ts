import get from 'lodash-es/get.js';
import environmentService from '../../../services/environment.service.js';
import type { Connection } from './../../../models/Connection.js';
import type { Config as ProviderConfig } from './../../../models/Provider.js';
import SyncClient from '../../../clients/sync.client.js';
import type { SyncConfig } from './../../../models/Sync.js';
import connectionService from '../../../services/connection.service.js';
import { getSyncConfigsByConfigIdForWebhook } from '../../../services/sync/config/config.service.js';
import { LogActionEnum } from '../../../models/Activity.js';
import telemetry, { LogTypes } from '../../../utils/telemetry.js';

export interface InternalNango {
    getWebhooks: (environment_id: number, nango_config_id: number) => Promise<SyncConfig[]>;
    executeScriptForWebhooks(integration: ProviderConfig, body: any, webhookType: string, connectionIdentifier: string, propName?: string): Promise<void>;
}

export const internalNango: InternalNango = {
    getWebhooks: async (environment_id, nango_config_id) => {
        return await getSyncConfigsByConfigIdForWebhook(environment_id, nango_config_id);
    },
    executeScriptForWebhooks: async (integration, body, webhookType, connectionIdentifier, propName) => {
        const syncConfigsWithWebhooks = await internalNango.getWebhooks(integration.environment_id, integration.id as number);

        if (syncConfigsWithWebhooks.length <= 0) {
            return;
        }

        const syncClient = await SyncClient.getInstance();

        if (!get(body, connectionIdentifier)) {
            await telemetry.log(
                LogTypes.INCOMING_WEBHOOK_ISSUE_WRONG_CONNECTION_IDENTIFIER,
                'Incoming webhook had the wrong connection identifier',
                LogActionEnum.WEBHOOK,
                {
                    environmentId: String(integration.environment_id),
                    provider: integration.provider,
                    providerConfigKey: integration.unique_key,
                    connectionIdentifier,
                    payload: JSON.stringify(body)
                }
            );

            return;
        }

        let connections: Connection[] | null = null;
        if (propName === 'connectionId') {
            const { success, response: connection } = await connectionService.getConnection(
                get(body, connectionIdentifier),
                integration.unique_key,
                integration.environment_id
            );

            if (success && connection) {
                connections = [connection];
            }
        } else {
            connections = await connectionService.findConnectionsByConnectionConfigValue(
                propName || connectionIdentifier,
                get(body, connectionIdentifier),
                integration.environment_id
            );
        }

        if (!connections || connections.length === 0) {
            await telemetry.log(
                LogTypes.INCOMING_WEBHOOK_ISSUE_CONNECTION_NOT_FOUND,
                'Incoming webhook received but no connection found for it',
                LogActionEnum.WEBHOOK,
                {
                    environmentId: String(integration.environment_id),
                    provider: integration.provider,
                    providerConfigKey: integration.unique_key,
                    propName: String(propName),
                    connectionIdentifier,
                    payload: JSON.stringify(body)
                }
            );
            return;
        }

        const accountId = await environmentService.getAccountIdFromEnvironment(integration.environment_id);

        await telemetry.log(LogTypes.INCOMING_WEBHOOK_RECEIVED, 'Incoming webhook received and connection found for it', LogActionEnum.WEBHOOK, {
            accountId: String(accountId),
            environmentId: String(integration.environment_id),
            provider: integration.provider,
            providerConfigKey: integration.unique_key,
            connectionIds: connections.map((connection) => connection.connection_id).join(',')
        });

        const type = get(body, webhookType);
        for (const syncConfig of syncConfigsWithWebhooks) {
            const { webhook_subscriptions } = syncConfig;

            if (!webhook_subscriptions) {
                continue;
            }

            for (const webhook of webhook_subscriptions) {
                if (type === webhook) {
                    for (const connection of connections) {
                        await syncClient?.triggerWebhook(connection, integration.provider, webhook, syncConfig.sync_name, body, integration.environment_id);
                    }
                }
            }
        }
    }
};
