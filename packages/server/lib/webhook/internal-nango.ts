import { createHash } from 'node:crypto';

import get from 'lodash-es/get.js';

import { OtlpSpan } from '@nangohq/logs';
import { NangoError, connectionService, getSyncConfigsByConfigIdForWebhook } from '@nangohq/shared';
import { errorToObject, metrics, report } from '@nangohq/utils';

import { envs } from '../env.js';
import { runWithConcurrencyLimit } from './runWithConcurrencyLimit.js';
import { getOrchestrator } from '../utils/utils.js';
import { dispatchQueuePublisher } from './dispatch-queue/client.js';
import { SQS_BATCH_MAX_BYTES } from './dispatch-queue/publisher.js';

import type { DispatchQueuePublisher, PreparedDispatchMessage } from './dispatch-queue/publisher.js';
import type { LogContext, LogContextGetter } from '@nangohq/logs';
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
const LOG_CONTEXT_CREATE_CONCURRENCY = 25;

interface MatchedExecution {
    syncConfig: DBSyncConfig;
    webhook: string;
    connection: DBConnectionDecrypted | ConnectionInternal;
}

interface QueuedExecution {
    syncConfig: DBSyncConfig;
    webhook: string;
    connection: DBConnectionDecrypted | ConnectionInternal;
    kind: 'queued';
    logCtx: Awaited<ReturnType<LogContextGetter['create']>>;
    preparedMessage: PreparedDispatchMessage;
}

interface OrchestratorExecution {
    syncConfig: DBSyncConfig;
    webhook: string;
    connection: DBConnectionDecrypted | ConnectionInternal;
    logCtx: LogContext;
}

interface FailedOrchestratorExecution extends OrchestratorExecution {
    error: unknown;
}

interface FailedQueuedExecution extends MatchedExecution {
    kind: 'failed';
    error: unknown;
}

function computeTaskName({
    environmentId,
    providerConfigKey,
    parentSyncName,
    connectionId,
    activityLogId
}: {
    environmentId: number;
    providerConfigKey: string;
    parentSyncName: string;
    connectionId: number;
    activityLogId: string;
}): string {
    const hash = createHash('sha256').update(`${environmentId}:${providerConfigKey}:${parentSyncName}:${connectionId}:${activityLogId}`).digest('hex');
    return `webhook:env:${environmentId}:connection:${connectionId}:${hash.slice(0, 32)}`;
}

export class InternalNango {
    readonly team: DBTeam;
    readonly environment: DBEnvironment;
    readonly plan?: DBPlan | undefined;
    readonly integration: DBIntegrationDecrypted;
    readonly logContextGetter: LogContextGetter;

    constructor(opts: {
        team: DBTeam;
        environment: DBEnvironment;
        plan?: DBPlan | undefined;
        integration: DBIntegrationDecrypted;
        logContextGetter: LogContextGetter;
    }) {
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

        const publisher = envs.WEBHOOK_INGRESS_USE_DISPATCH_QUEUE ? dispatchQueuePublisher : null;

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
        const executions: OrchestratorExecution[] = [];

        for (const syncConfig of syncConfigsWithWebhooks) {
            const { webhook_subscriptions } = syncConfig;
            if (!webhook_subscriptions) {
                continue;
            }

            let triggered = false;

            for (const webhook of webhook_subscriptions) {
                if (triggered) {
                    break;
                }

                if (type === webhook || webhookHeaderValue === webhook || webhook === '*') {
                    for (const connection of connections) {
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
                        executions.push({ syncConfig, webhook, connection, logCtx });
                    }

                    triggered = true;
                    if (webhook === '*') {
                        // Only trigger once since it will match all webhooks
                        break;
                    }
                }
            }
        }

        const dispatchResult = await this.dispatchExecutionsViaOrchestrator(executions, body);
        metrics.increment(metrics.Types.WEBHOOK_DIRECT_TRIGGER_SUCCESS, dispatchResult.succeededCount, { provider: this.integration.provider });
    }

    private async dispatchExecutionsViaOrchestrator(
        executions: OrchestratorExecution[],
        body: Record<string, any>
    ): Promise<{ succeededCount: number; failedExecutions: FailedOrchestratorExecution[] }> {
        const orchestrator = getOrchestrator();
        let succeededCount = 0;
        const failedExecutions: FailedOrchestratorExecution[] = [];

        for (const execution of executions) {
            const { syncConfig, webhook, connection, logCtx } = execution;

            try {
                const result = await orchestrator.triggerWebhook({
                    connection,
                    webhookName: webhook,
                    syncConfig,
                    input: body,
                    maxConcurrency: envs.WEBHOOK_ENVIRONMENT_MAX_CONCURRENCY,
                    logCtx
                });

                if (result.isErr()) {
                    failedExecutions.push({ ...execution, error: result.error });
                    continue;
                }

                succeededCount += 1;
            } catch (err) {
                failedExecutions.push({ ...execution, error: err });
            }
        }

        return { succeededCount, failedExecutions };
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
        const matchedExecutions: MatchedExecution[] = [];

        for (const syncConfig of syncConfigsWithWebhooks) {
            const { webhook_subscriptions } = syncConfig;
            if (!webhook_subscriptions) continue;

            let matched = false;
            for (const webhook of webhook_subscriptions) {
                if (matched) break;

                if (type === webhook || webhookHeaderValue === webhook || webhook === '*') {
                    for (const connection of connections) {
                        matchedExecutions.push({ syncConfig, webhook, connection });
                    }

                    matched = true;
                }
            }
        }

        if (matchedExecutions.length === 0) return;

        const queuePreparationResults = await runWithConcurrencyLimit(
            matchedExecutions,
            LOG_CONTEXT_CREATE_CONCURRENCY,
            async ({ syncConfig, webhook, connection }) => {
                let logCtx: Awaited<ReturnType<LogContextGetter['create']>> | null = null;

                try {
                    // Create a log context per (syncConfig × connection × webhook) triple before publishing
                    // so the runner picks up the same activityLogId it would have in the direct-schedule path.
                    logCtx = await this.logContextGetter.create(
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

                    const message: WebhookDispatchMessage = {
                        version: 1,
                        kind: 'webhook',
                        taskName: computeTaskName({
                            environmentId: this.environment.id,
                            providerConfigKey: this.integration.unique_key,
                            parentSyncName: syncConfig.sync_name,
                            connectionId: connection.id,
                            activityLogId: logCtx.id
                        }),
                        createdAt: new Date().toISOString(),
                        accountId: this.team.id,
                        integrationId: this.integration.id!,
                        provider: this.integration.provider,
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
                    };
                    const serializedBody = JSON.stringify(message);
                    const preparedMessage: PreparedDispatchMessage = {
                        message,
                        byteSize: Buffer.byteLength(serializedBody, 'utf8')
                    };

                    return {
                        kind: 'queued' as const,
                        logCtx,
                        syncConfig,
                        webhook,
                        connection,
                        preparedMessage
                    };
                } catch (err) {
                    if (logCtx) {
                        const formattedError = err instanceof NangoError ? err : new NangoError('webhook_failure', { error: errorToObject(err) });

                        await logCtx.error('The webhook failed during queue preparation', {
                            error: err,
                            webhook,
                            connection: connection.connection_id,
                            integration: connection.provider_config_key
                        });
                        await logCtx.enrichOperation({ error: formattedError });
                        await logCtx.failed();
                    }

                    return {
                        kind: 'failed' as const,
                        error: err,
                        syncConfig,
                        webhook,
                        connection
                    };
                }
            }
        );

        const queuedExecutions = queuePreparationResults.filter((result): result is QueuedExecution => result.kind === 'queued');
        const failedQueuedExecutions = queuePreparationResults.filter((result): result is FailedQueuedExecution => result.kind === 'failed');

        for (const { error, syncConfig, webhook, connection } of failedQueuedExecutions) {
            report(error, {
                error: 'The webhook could not be prepared for queue dispatch',
                provider: this.integration.provider,
                accountId: this.team.id,
                environmentId: this.environment.id,
                syncConfigId: syncConfig.id,
                syncName: syncConfig.sync_name,
                webhook,
                connectionId: connection.id,
                connection: connection.connection_id,
                integration: connection.provider_config_key
            });
        }

        if (queuedExecutions.length === 0) {
            return;
        }

        if (matchedExecutions.length > LARGE_FANOUT_THRESHOLD) {
            metrics.increment(metrics.Types.WEBHOOK_DISPATCH_LARGE_FANOUT, 1, {
                provider: this.integration.provider,
                accountId: this.team.id,
                environmentId: this.environment.id
            });
        }

        const queueEligibleExecutions = queuedExecutions.filter(({ preparedMessage }) => preparedMessage.byteSize <= SQS_BATCH_MAX_BYTES);
        const oversizedExecutions = queuedExecutions.filter(({ preparedMessage }) => preparedMessage.byteSize > SQS_BATCH_MAX_BYTES);

        let unmappedFailureCount = 0;

        if (queueEligibleExecutions.length > 0) {
            const messageGroupId = `account:${this.team.id}:env:${this.environment.id}`;
            const publishResult = await publisher.publish(
                queueEligibleExecutions.map(({ preparedMessage }) => preparedMessage),
                messageGroupId
            );
            const failedActivityLogIds = new Set(publishResult.failedActivityLogIds);
            unmappedFailureCount = publishResult.failed - failedActivityLogIds.size;

            for (const {
                preparedMessage: { message },
                logCtx
            } of queueEligibleExecutions) {
                if (!failedActivityLogIds.has(message.activityLogId) && unmappedFailureCount === 0) {
                    void logCtx.info('The webhook was successfully queued for execution', {
                        action: message.webhookName,
                        connection: message.connection.connection_id,
                        integration: message.connection.provider_config_key
                    });
                    continue;
                }

                const error = new NangoError('webhook_failure', {
                    error: 'The webhook could not be queued for execution',
                    taskName: message.taskName
                });

                await logCtx.error('The webhook failed to queue for execution', {
                    error,
                    webhook: message.webhookName,
                    connection: message.connection.connection_id,
                    integration: message.connection.provider_config_key
                });
                await logCtx.enrichOperation({ error });
                await logCtx.failed();
            }
        }

        if (oversizedExecutions.length > 0) {
            metrics.increment(metrics.Types.WEBHOOK_DISPATCH_BYPASS_OVERSIZE, oversizedExecutions.length, {
                provider: this.integration.provider,
                accountId: this.team.id,
                environmentId: this.environment.id
            });

            for (const {
                preparedMessage: { message },
                logCtx
            } of oversizedExecutions) {
                void logCtx.warn('The webhook payload exceeds the queue size limit and will be dispatched directly', {
                    action: message.webhookName,
                    connection: message.connection.connection_id,
                    integration: message.connection.provider_config_key
                });
            }

            const dispatchResult = await this.dispatchExecutionsViaOrchestrator(oversizedExecutions, body);

            for (const { error, syncConfig, webhook, connection } of dispatchResult.failedExecutions) {
                report(error, {
                    context: 'oversized webhook direct dispatch failed',
                    provider: this.integration.provider,
                    accountId: this.team.id,
                    environmentId: this.environment.id,
                    syncConfigId: syncConfig.id,
                    syncName: syncConfig.sync_name,
                    webhook,
                    connectionId: connection.id,
                    connection: connection.connection_id,
                    integration: connection.provider_config_key
                });
            }
        }

        if (unmappedFailureCount > 0) {
            report(new Error('webhook_dispatch_fanout_unmapped_failures'), {
                unmappedFailureCount,
                accountId: this.team.id,
                environmentId: this.environment.id
            });
        }
    }
}
