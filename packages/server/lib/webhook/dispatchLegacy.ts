import { OtlpSpan } from '@nangohq/logs';
import { NangoError } from '@nangohq/shared';
import { errorToObject, report } from '@nangohq/utils';

import { envs } from '../env.js';
import { getOrchestrator } from '../utils/utils.js';
import { computeIdempotencyKey } from './dispatch.js';

import type { DirectDispatchSource, DispatchContext, PreparedDispatchExecution, WebhookConnection } from './dispatch.js';
import type { LogContextGetter } from '@nangohq/logs';
import type { DBSyncConfig, LegacyDispatchMessage } from '@nangohq/types';

export interface MatchedLegacyExecution {
    syncConfig: DBSyncConfig;
    webhook: string;
    connection: WebhookConnection;
}

export async function prepareLegacyDispatchExecution({
    context,
    execution,
    payload
}: {
    context: DispatchContext;
    execution: MatchedLegacyExecution;
    payload: Record<string, any>;
}): Promise<PreparedDispatchExecution<LegacyDispatchMessage> | null> {
    const { syncConfig, webhook, connection } = execution;
    let logCtx: Awaited<ReturnType<LogContextGetter['create']>>;

    try {
        logCtx = await context.logContextGetter.create(
            { operation: { type: 'webhook', action: 'incoming' }, expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() },
            {
                account: context.team,
                environment: context.environment,
                integration: { id: context.integration.id!, name: context.integration.unique_key, provider: context.integration.provider },
                connection: { id: connection.id, name: connection.connection_id },
                syncConfig: { id: syncConfig.id, name: syncConfig.sync_name }
            }
        );
    } catch (err) {
        await handleLegacyPreparationFailure({ context, execution, error: err });
        return null;
    }

    try {
        logCtx.attachSpan(new OtlpSpan(logCtx.operation));

        const message: LegacyDispatchMessage = {
            version: 1,
            kind: 'webhook',
            taskName: computeIdempotencyKey({
                kind: 'webhook',
                environmentId: context.environment.id,
                providerConfigKey: context.integration.unique_key,
                executionName: syncConfig.sync_name,
                connectionId: connection.id,
                activityLogId: logCtx.id
            }),
            createdAt: new Date().toISOString(),
            accountId: context.team.id,
            integrationId: context.integration.id!,
            provider: context.integration.provider,
            parentSyncName: syncConfig.sync_name,
            activityLogId: logCtx.id,
            webhookName: webhook,
            connection: {
                id: connection.id,
                connection_id: connection.connection_id,
                provider_config_key: connection.provider_config_key,
                environment_id: connection.environment_id
            },
            payload
        };
        let byteSize: number | undefined;

        return {
            preparedMessage: {
                message,
                // Only serialize the payload when needed to compute the byte size
                get byteSize() {
                    byteSize ??= Buffer.byteLength(JSON.stringify(message), 'utf8');
                    return byteSize;
                }
            },
            executeDirect: (source) => executeLegacyDirect({ context, execution, payload, logCtx, source }),
            onQueued: async () => {
                await logCtx.info('The webhook was successfully queued for execution', {
                    action: message.webhookName,
                    connection: message.connection.connection_id,
                    integration: message.connection.provider_config_key
                });
            },
            onQueueFailure: async () => {
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
            },
            onOversized: async () => {
                await logCtx
                    .warn('The webhook payload exceeds the queue size limit and will be dispatched directly', {
                        action: message.webhookName,
                        connection: message.connection.connection_id,
                        integration: message.connection.provider_config_key
                    })
                    .catch(() => {
                        // Logging is best effort. Catch and do not throw the logging failure.
                    });
            }
        };
    } catch (err) {
        await handleLegacyPreparationFailure({ context, execution, error: err, logCtx });
        return null;
    }
}

async function handleLegacyPreparationFailure({
    context,
    execution,
    error,
    logCtx
}: {
    context: DispatchContext;
    execution: MatchedLegacyExecution;
    error: unknown;
    logCtx?: Awaited<ReturnType<LogContextGetter['create']>>;
}): Promise<void> {
    const formattedError = error instanceof NangoError ? error : new NangoError('webhook_failure', { error: errorToObject(error) });

    await logCtx?.error('The webhook failed during queue preparation', {
        error,
        webhook: execution.webhook,
        connection: execution.connection.connection_id,
        integration: execution.connection.provider_config_key
    });
    await logCtx?.enrichOperation({ error: formattedError });
    await logCtx?.failed();

    report(error, {
        error: 'The webhook could not be prepared for dispatch',
        provider: context.integration.provider,
        accountId: context.team.id,
        environmentId: context.environment.id,
        syncConfigId: execution.syncConfig.id,
        syncName: execution.syncConfig.sync_name,
        webhook: execution.webhook,
        connectionId: execution.connection.id,
        connection: execution.connection.connection_id,
        integration: execution.connection.provider_config_key
    });
}

async function executeLegacyDirect({
    context,
    execution,
    payload,
    logCtx,
    source
}: {
    context: DispatchContext;
    execution: MatchedLegacyExecution;
    payload: Record<string, any>;
    logCtx: Awaited<ReturnType<LogContextGetter['create']>>;
    source: DirectDispatchSource;
}): Promise<boolean> {
    try {
        const result = await getOrchestrator().triggerWebhook({
            connection: execution.connection,
            webhookName: execution.webhook,
            syncConfig: execution.syncConfig,
            input: payload,
            maxConcurrency: envs.WEBHOOK_ENVIRONMENT_MAX_CONCURRENCY,
            logCtx
        });

        if (result.isErr()) {
            reportOversizedFailure({ context, execution, error: result.error, source });
            return false;
        }

        return true;
    } catch (err) {
        reportOversizedFailure({ context, execution, error: err, source });
        return false;
    }
}

function reportOversizedFailure({
    context,
    execution,
    error,
    source
}: {
    context: DispatchContext;
    execution: MatchedLegacyExecution;
    error: unknown;
    source: DirectDispatchSource;
}): void {
    if (source !== 'oversized' || (error instanceof NangoError && error.type === 'webhook_rate_limit_exceeded')) return;

    report(error, {
        context: 'oversized webhook direct dispatch failed',
        provider: context.integration.provider,
        accountId: context.team.id,
        environmentId: context.environment.id,
        syncConfigId: execution.syncConfig.id,
        syncName: execution.syncConfig.sync_name,
        webhook: execution.webhook,
        connectionId: execution.connection.id,
        connection: execution.connection.connection_id,
        integration: execution.connection.provider_config_key
    });
}
