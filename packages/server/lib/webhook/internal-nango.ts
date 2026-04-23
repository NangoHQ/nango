import { createHash } from 'node:crypto';

import get from 'lodash-es/get.js';

import { OtlpSpan } from '@nangohq/logs';
import { connectionService, getSyncConfigsByConfigIdForWebhook } from '@nangohq/shared';
import { metrics } from '@nangohq/utils';

import { envs } from '../env.js';
import { getOrchestrator } from '../utils/utils.js';
import { getDispatchQueuePublisher } from './dispatch-queue/client.js';

import type { DispatchQueuePublisher } from './dispatch-queue/publisher.js';
import type { LogContextGetter } from '@nangohq/logs';
import type { Config } from '@nangohq/shared';
import type {
    ConnectionInternal,
    DBConnectionDecrypted,
    DBEnvironment,
    DBIntegrationDecrypted,
    DBPlan,
    DBSyncConfig,
    DBTeam,
    Metadata,
    WebhookDispatchMessage
} from '@nangohq/types';

const LARGE_FANOUT_THRESHOLD = 200;

function computeTaskName({
    environmentId,
    providerConfigKey,
    parentSyncName,
    connectionId,
    ingressRequestId
}: {
    environmentId: number;
    providerConfigKey: string;
    parentSyncName: string;
    connectionId: number;
    ingressRequestId: string;
}): string {
    const hash = createHash('sha256').update(`${environmentId}:${providerConfigKey}:${parentSyncName}:${connectionId}:${ingressRequestId}`).digest('hex');
    return `webhook:${hash.slice(0, 32)}`;
}

export class InternalNango {
    readonly team: DBTeam;
    readonly environment: DBEnvironment;
    readonly plan?: DBPlan | undefined;
    readonly integration: DBIntegrationDecrypted;
    readonly logContextGetter: LogContextGetter;
    readonly ingressRequestId: string;

    constructor(opts: {
        team: DBTeam;
        environment: DBEnvironment;
        plan?: DBPlan | undefined;
        integration: DBIntegrationDecrypted;
        logContextGetter: LogContextGetter;
        ingressRequestId: string;
    }) {
        this.team = opts.team;
        this.environment = opts.environment;
        this.plan = opts.plan;
        this.integration = opts.integration;
        this.logContextGetter = opts.logContextGetter;
        this.ingressRequestId = opts.ingressRequestId;
    }

    async getWebhooks() {
        return await getSyncConfigsByConfigIdForWebhook(this.environment.id, this.integration.id!);
    }

    async executeScriptForWebhooks({
        body,
        webhookType,
        webhookHeaderValue,
        webhookTypeValue,
        connectionIdentifier,
        connectionIdentifierValue,
        propName
    }: {
        body: Record<string, any>;
        webhookType?: string;
        webhookHeaderValue?: string;
        webhookTypeValue?: string;
        connectionIdentifier?: string;
        connectionIdentifierValue?: string;
        propName?: string;
    }): Promise<{ connectionIds: string[]; connectionMetadata: Record<string, Metadata | null> }> {
        let connections: DBConnectionDecrypted[] | null | ConnectionInternal[] = null;

        const identifierValue = connectionIdentifierValue || (connectionIdentifier ? get(body, connectionIdentifier) : undefined);

        if (!connectionIdentifier && !identifierValue) {
            connections = await connectionService.getConnectionsByEnvironmentAndConfig(this.environment.id, this.integration.unique_key);
        } else if (!identifierValue) {
            return { connectionIds: [], connectionMetadata: {} };
        } else if (propName === 'connectionId') {
            const { success, response: connection } = await connectionService.getConnection(identifierValue, this.integration.unique_key, this.environment.id);

            if (success && connection) {
                connections = [connection];
            }
        } else if (propName && propName.includes('metadata.')) {
            const strippedMetadata = propName.replace('metadata.', '');
            connections = await connectionService.findConnectionsByMetadataValue({
                metadataProperty: strippedMetadata,
                payloadIdentifier: identifierValue,
                configId: this.integration.id,
                environmentId: this.environment.id
            });
        } else {
            connections = await connectionService.findConnectionsByConnectionConfigValue(
                propName || connectionIdentifier || '',
                identifierValue,
                this.environment.id,
                this.integration.id
            );
        }

        if (!connections || connections.length === 0) {
            return { connectionIds: [], connectionMetadata: {} };
        }

        // Disable executions of webhooks but we still need to return the connection ids
        if (this.plan && !this.plan.has_webhooks_script) {
            const connectionMetadata = connections.reduce<Record<string, Metadata | null>>((acc, connection) => {
                acc[connection.connection_id] = 'metadata' in connection ? connection.metadata : null;
                return acc;
            }, {});
            return { connectionIds: connections.map((connection) => connection.connection_id), connectionMetadata };
        }

        const syncConfigsWithWebhooks = await this.getWebhooks();

        if (syncConfigsWithWebhooks.length <= 0) {
            const connectionMetadata = connections.reduce<Record<string, Metadata | null>>((acc, connection) => {
                acc[connection.connection_id] = 'metadata' in connection ? connection.metadata : null;
                return acc;
            }, {});
            return { connectionIds: connections.map((connection) => connection.connection_id), connectionMetadata };
        }

        // use webhookTypeValue if provided (direct value from headers), otherwise extract from body
        const type = webhookTypeValue || (webhookType ? get(body, webhookType) : undefined);

        const publisher = envs.WEBHOOK_INGRESS_USE_DISPATCH_QUEUE ? getDispatchQueuePublisher() : null;

        if (publisher) {
            await this.dispatchViaQueue({
                publisher,
                connections,
                syncConfigsWithWebhooks,
                body,
                type,
                webhookHeaderValue
            });
        } else {
            await this.dispatchViaOrchestrator({ connections, syncConfigsWithWebhooks, body, type, webhookHeaderValue });
        }

        const connectionMetadata = connections.reduce<Record<string, Metadata | null>>((acc, connection) => {
            acc[connection.connection_id] = 'metadata' in connection ? connection.metadata : null;
            return acc;
        }, {});

        return { connectionIds: connections.map((connection) => connection.connection_id), connectionMetadata };
    }

    private async dispatchViaOrchestrator({
        connections,
        syncConfigsWithWebhooks,
        body,
        type,
        webhookHeaderValue
    }: {
        connections: (DBConnectionDecrypted | ConnectionInternal)[];
        syncConfigsWithWebhooks: DBSyncConfig[];
        body: Record<string, any>;
        type: string | undefined;
        webhookHeaderValue: string | undefined;
    }): Promise<void> {
        const orchestrator = getOrchestrator();

        for (const syncConfig of syncConfigsWithWebhooks) {
            const { webhook_subscriptions } = syncConfig;
            if (!webhook_subscriptions) continue;

            let triggered = false;
            for (const webhook of webhook_subscriptions) {
                if (triggered) break;

                if (type === webhook || webhookHeaderValue === webhook || webhook === '*') {
                    for (const connection of connections) {
                        await orchestrator.triggerWebhook({
                            account: this.team,
                            environment: this.environment,
                            integration: this.integration as Config,
                            connection,
                            webhookName: webhook,
                            syncConfig,
                            input: body,
                            maxConcurrency: envs.WEBHOOK_ENVIRONMENT_MAX_CONCURRENCY,
                            logContextGetter: this.logContextGetter
                        });
                    }

                    triggered = true;
                    if (webhook === '*') break;
                }
            }
        }
    }

    private async dispatchViaQueue({
        publisher,
        connections,
        syncConfigsWithWebhooks,
        body,
        type,
        webhookHeaderValue
    }: {
        publisher: DispatchQueuePublisher;
        connections: (DBConnectionDecrypted | ConnectionInternal)[];
        syncConfigsWithWebhooks: DBSyncConfig[];
        body: Record<string, any>;
        type: string | undefined;
        webhookHeaderValue: string | undefined;
    }): Promise<void> {
        const messages: WebhookDispatchMessage[] = [];

        for (const syncConfig of syncConfigsWithWebhooks) {
            const { webhook_subscriptions } = syncConfig;
            if (!webhook_subscriptions) continue;

            let matched = false;
            for (const webhook of webhook_subscriptions) {
                if (matched) break;

                if (type === webhook || webhookHeaderValue === webhook || webhook === '*') {
                    for (const connection of connections) {
                        // Create a log context per (syncConfig × connection × webhook) triple before publishing
                        // so the runner picks up the same activityLogId it would have in the direct-schedule path.
                        const logCtx = await this.logContextGetter.create(
                            { operation: { type: 'webhook', action: 'incoming' }, expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() },
                            {
                                account: this.team,
                                environment: this.environment,
                                integration: { id: this.integration.id!, name: this.integration.unique_key, provider: this.integration.provider },
                                connection: { id: connection.id, name: connection.connection_id },
                                syncConfig: { id: syncConfig.id, name: syncConfig.sync_name }
                            }
                        );
                        logCtx.attachSpan(new OtlpSpan(logCtx.operation));

                        messages.push({
                            version: 1,
                            kind: 'webhook',
                            taskName: computeTaskName({
                                environmentId: this.environment.id,
                                providerConfigKey: this.integration.unique_key,
                                parentSyncName: syncConfig.sync_name,
                                connectionId: connection.id,
                                ingressRequestId: this.ingressRequestId
                            }),
                            createdAt: new Date().toISOString(),
                            ingressRequestId: this.ingressRequestId,
                            accountId: this.team.id,
                            environmentId: this.environment.id,
                            integrationId: this.integration.id!,
                            provider: this.integration.provider,
                            providerConfigKey: this.integration.unique_key,
                            parentSyncName: syncConfig.sync_name,
                            activityLogId: logCtx.id,
                            webhookName: webhook,
                            connection: {
                                id: connection.id,
                                connection_id: connection.connection_id,
                                provider_config_key: connection.provider_config_key,
                                environment_id: connection.environment_id
                            },
                            payload: body
                        });
                    }

                    matched = true;
                    if (webhook === '*') break;
                }
            }
        }

        if (messages.length === 0) return;

        if (messages.length > LARGE_FANOUT_THRESHOLD) {
            metrics.increment(metrics.Types.WEBHOOK_DISPATCH_LARGE_FANOUT, 1, { provider: this.integration.provider });
        }

        const messageGroupId = `account:${this.team.id}:env:${this.environment.id}`;
        await publisher.publish(messages, messageGroupId);
    }
}
