import { LogContextOrigin, OtlpSpan } from '@nangohq/logs';
import { getFunctionMaxConcurrency, NangoError, validateFunctionInput } from '@nangohq/shared';
import { errorToObject, truncateJson } from '@nangohq/utils';

import { getOrchestrator } from '../utils/utils.js';
import { computeIdempotencyKey } from './dispatch.js';

import type { DispatchContext, PreparedDispatchExecution, WebhookConnection } from './dispatch.js';
import type { LogContext } from '@nangohq/logs';
import type { DBFunctionConfig, DBFunctionConfigVersion, FunctionDispatchMessage, FunctionTrigger } from '@nangohq/types';

export interface MatchedFunctionExecution {
    config: DBFunctionConfig;
    version: DBFunctionConfigVersion;
    subscription: string;
    connection: WebhookConnection;
}

interface PreparedFunctionExecution extends MatchedFunctionExecution {
    logCtx: LogContext;
    trigger: Extract<FunctionTrigger, { kind: 'http' }> & {
        subscriptions: string[];
        connection: NonNullable<Extract<FunctionTrigger, { kind: 'http' }>['connection']>;
    };
    maxConcurrency: number;
}

export async function prepareFunctionDispatchExecution({
    context,
    execution,
    payload
}: {
    context: DispatchContext;
    execution: MatchedFunctionExecution;
    payload: Record<string, any>;
}): Promise<PreparedDispatchExecution<FunctionDispatchMessage> | null> {
    const preparedExecution = await prepareFunctionExecution({ context, execution, payload });
    if (!preparedExecution) return null;

    const message: FunctionDispatchMessage = {
        version: 1,
        kind: 'function',
        idempotencyKey: computeIdempotencyKey({
            kind: 'function',
            environmentId: context.environment.id,
            providerConfigKey: context.integration.unique_key,
            executionName: preparedExecution.config.name,
            connectionId: preparedExecution.connection.id,
            activityLogId: preparedExecution.logCtx.id
        }),
        createdAt: new Date().toISOString(),
        accountId: context.team.id,
        integrationId: context.integration.id!,
        provider: context.integration.provider,
        activityLogId: preparedExecution.logCtx.id,
        connection: {
            id: preparedExecution.connection.id,
            connection_id: preparedExecution.connection.connection_id,
            provider_config_key: preparedExecution.connection.provider_config_key,
            environment_id: preparedExecution.connection.environment_id
        },
        functionName: preparedExecution.config.name,
        trigger: {
            kind: 'http',
            input: preparedExecution.trigger.input,
            request: preparedExecution.trigger.request,
            subscriptions: preparedExecution.trigger.subscriptions,
            connection: preparedExecution.trigger.connection
        },
        maxConcurrency: preparedExecution.maxConcurrency
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
        executeDirect: () => executeFunctionDirect({ context, execution: preparedExecution }),
        onQueued: async () => {
            await preparedExecution.logCtx.info('The function was successfully queued for execution', {
                function: message.functionName,
                connection: message.connection.connection_id,
                integration: message.connection.provider_config_key
            });
        },
        onQueueFailure: () =>
            handleFunctionDispatchFailure({
                execution: preparedExecution,
                error: new NangoError('function_failure', {
                    error: 'The function could not be queued for execution',
                    idempotencyKey: message.idempotencyKey
                }),
                logCtx: preparedExecution.logCtx,
                message: 'The function failed to queue for execution'
            }),
        onOversized: async () => {
            await preparedExecution.logCtx
                .warn('The function payload exceeds the queue size limit and will be dispatched directly', {
                    function: preparedExecution.config.name,
                    connection: preparedExecution.connection.connection_id,
                    integration: preparedExecution.connection.provider_config_key
                })
                .catch(() => {
                    // Logging is best effort. Catch and do not throw the logging failure.
                });
        }
    } satisfies PreparedDispatchExecution<FunctionDispatchMessage>;
}

async function prepareFunctionExecution({
    context,
    execution,
    payload
}: {
    context: DispatchContext;
    execution: MatchedFunctionExecution;
    payload: Record<string, any>;
}): Promise<PreparedFunctionExecution | null> {
    let logCtx: LogContext | undefined;

    try {
        logCtx = await context.logContextGetter.create(
            { operation: { type: 'function', action: 'invoke' }, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
            {
                account: context.team,
                environment: context.environment,
                integration: { id: context.integration.id!, name: context.integration.unique_key, provider: context.integration.provider },
                connection: { id: execution.connection.id, name: execution.connection.connection_id },
                syncConfig: { id: execution.version.id, name: execution.config.name },
                meta: { source: 'webhook', subscription: execution.subscription, ...truncateJson({ input: payload }) }
            }
        );
        if (logCtx instanceof LogContextOrigin) {
            logCtx.attachSpan(new OtlpSpan(logCtx.operation));
        }

        // a function that declares no input schema receives no trigger.input.
        // The payload can be read from trigger.request.
        const validation = validateFunctionInput(execution.version, execution.version.input_schema_ref ? payload : undefined);
        if (validation.isErr()) {
            await handleFunctionDispatchFailure({
                execution,
                error: validation.error,
                logCtx,
                message: 'The function input failed validation during webhook dispatch preparation'
            });
            return null;
        }

        const trigger = execution.version.trigger;
        if (trigger.kind !== 'http') {
            throw new NangoError('function_failure', { error: 'The function no longer has an HTTP trigger' });
        }

        return {
            ...execution,
            logCtx,
            trigger: {
                kind: 'http',
                input: validation.value,
                request: context.request,
                subscriptions: [execution.subscription],
                connection: {
                    connectionId: execution.connection.connection_id,
                    integrationId: context.integration.unique_key
                }
            },
            maxConcurrency: getFunctionMaxConcurrency(execution.version)
        };
    } catch (err) {
        await handleFunctionDispatchFailure({
            execution,
            error: err,
            logCtx,
            message: 'The function failed during webhook dispatch preparation'
        });
        return null;
    }
}

async function executeFunctionDirect({ context, execution }: { context: DispatchContext; execution: PreparedFunctionExecution }): Promise<boolean> {
    try {
        const result = await getOrchestrator().invokeFunction({
            environment: context.environment,
            connection: execution.connection,
            functionName: execution.config.name,
            trigger: execution.trigger,
            async: true,
            retryMax: 0,
            maxConcurrency: execution.maxConcurrency,
            logCtx: execution.logCtx
        });

        if (result.isErr()) {
            await handleFunctionDispatchFailure({
                execution,
                error: result.error,
                logCtx: execution.logCtx,
                message: 'The function failed to schedule from the webhook'
            });
            return false;
        }

        return true;
    } catch (err) {
        await handleFunctionDispatchFailure({
            execution,
            error: err,
            logCtx: execution.logCtx,
            message: 'The function failed to schedule from the webhook'
        });
        return false;
    }
}

async function handleFunctionDispatchFailure({
    execution,
    error,
    logCtx,
    message
}: {
    execution: MatchedFunctionExecution;
    error: unknown;
    logCtx: LogContext | undefined;
    message: string;
}): Promise<void> {
    const formattedError = error instanceof NangoError ? error : new NangoError('function_failure', { error: errorToObject(error) });

    await logCtx?.error(message, {
        error,
        function: execution.config.name,
        subscription: execution.subscription,
        connection: execution.connection.connection_id,
        integration: execution.connection.provider_config_key
    });
    await logCtx?.enrichOperation({ error: formattedError });
    await logCtx?.failed();
}
