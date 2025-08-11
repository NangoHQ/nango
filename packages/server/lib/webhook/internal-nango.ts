import get from 'lodash-es/get.js';

import { connectionService, getSyncConfigsByConfigIdForWebhook } from '@nangohq/shared';

import { getOrchestrator } from '../utils/utils.js';

import type { LogContextGetter } from '@nangohq/logs';
import type { Config } from '@nangohq/shared';
import type { DBConnectionDecrypted, DBEnvironment, DBIntegrationDecrypted, DBPlan, DBTeam } from '@nangohq/types';

export class InternalNango {
    readonly team: DBTeam;
    readonly environment: DBEnvironment;
    readonly plan: DBPlan;
    readonly integration: DBIntegrationDecrypted;
    readonly logContextGetter: LogContextGetter;

    constructor(opts: { team: DBTeam; environment: DBEnvironment; plan: DBPlan; integration: DBIntegrationDecrypted; logContextGetter: LogContextGetter }) {
        this.team = opts.team;
        this.environment = opts.environment;
        this.plan = opts.plan;
        this.integration = opts.integration;
        this.logContextGetter = opts.logContextGetter;
    }

    async getWebhooks() {
        return await getSyncConfigsByConfigIdForWebhook(this.environment.id, this.integration.id!);
    }

    async executeScriptForWebhooks({
        body,
        webhookType,
        connectionIdentifier,
        propName
    }: {
        body: Record<string, any>;
        webhookType: string;
        connectionIdentifier: string;
        propName?: string;
    }): Promise<{ connectionIds: string[] }> {
        if (!get(body, connectionIdentifier)) {
            return { connectionIds: [] };
        }

        let connections: DBConnectionDecrypted[] | null = null;
        if (propName === 'connectionId') {
            const { success, response: connection } = await connectionService.getConnection(
                get(body, connectionIdentifier),
                this.integration.unique_key,
                this.environment.id
            );

            if (success && connection) {
                connections = [connection];
            }
        } else if (propName && propName.includes('metadata.')) {
            const strippedMetadata = propName.replace('metadata.', '');
            connections = await connectionService.findConnectionsByMetadataValue({
                metadataProperty: strippedMetadata,
                payloadIdentifier: get(body, connectionIdentifier),
                configId: this.integration.id,
                environmentId: this.environment.id
            });
        } else {
            connections = await connectionService.findConnectionsByConnectionConfigValue(
                propName || connectionIdentifier,
                get(body, connectionIdentifier),
                this.environment.id
            );
        }

        if (!connections || connections.length === 0) {
            return { connectionIds: [] };
        }

        // Disable executions of webhooks but we still need to return the connection ids
        if (!this.plan.has_webhooks_script) {
            return { connectionIds: connections.map((connection) => connection.connection_id) };
        }

        const syncConfigsWithWebhooks = await this.getWebhooks();

        if (syncConfigsWithWebhooks.length <= 0) {
            return { connectionIds: connections?.map((connection) => connection.connection_id) };
        }

        const type = get(body, webhookType);

        const orchestrator = getOrchestrator();

        for (const syncConfig of syncConfigsWithWebhooks) {
            const { webhook_subscriptions } = syncConfig;

            if (!webhook_subscriptions) {
                continue;
            }

            for (const webhook of webhook_subscriptions) {
                if (type === webhook || webhook === '*') {
                    for (const connection of connections) {
                        await orchestrator.triggerWebhook({
                            account: this.team,
                            environment: this.environment,
                            integration: this.integration as Config,
                            connection,
                            webhookName: webhook,
                            syncConfig,
                            input: body,
                            logContextGetter: this.logContextGetter
                        });
                    }

                    if (webhook === '*') {
                        // Only trigger once since it will match all webhooks
                        break;
                    }
                }
            }
        }

        return { connectionIds: connections.map((connection) => connection.connection_id) };
    }
}
