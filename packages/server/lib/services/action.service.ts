import { defaultOperationExpiration, logContextGetter, OtlpSpan } from '@nangohq/logs';
import { configService, connectionService, getSyncConfigRaw, pubsub } from '@nangohq/shared';
import { Err, Ok, truncateJson } from '@nangohq/utils';

import { envs } from '../env.js';
import { getOrchestrator } from '../utils/utils.js';

import type { LogContextOrigin } from '@nangohq/logs';
import type { NangoError } from '@nangohq/shared';
import type { AsyncActionResponse, DBEnvironment, DBTeam, Result } from '@nangohq/types';
import type { Span } from 'dd-trace';

export type ActionExecutionSuccess = AsyncActionResponse | { data: unknown };

export type ActionExecutionErrorCode = 'unknown_connection' | 'unknown_provider' | 'unknown_action' | 'disabled_action' | 'action_failed' | 'internal_error';

export class ActionExecutionError extends Error {
    readonly code: ActionExecutionErrorCode;
    /** Set when the orchestrator ran the action and it failed, so callers can report the underlying failure. */
    readonly nangoError: NangoError | undefined;

    constructor({ code, message, nangoError }: { code: ActionExecutionErrorCode; message: string; nangoError?: NangoError }) {
        super(message);
        this.name = 'ActionExecutionError';
        this.code = code;
        this.nangoError = nangoError;
    }
}

export interface ActionExecution {
    /** Created once the action is known to exist, so callers can enrich the operation afterwards. */
    logCtx: LogContextOrigin | undefined;
    result: Result<ActionExecutionSuccess, ActionExecutionError>;
}

/**
 * Executes an action and reports the outcome as a value.
 *
 * Transport agnostic on purpose: HTTP handlers, MCP tool calls and agent sessions all
 * map the outcome to their own response shape.
 */
export async function executeAction({
    account,
    environment,
    connectionId,
    providerConfigKey,
    actionName,
    input,
    isAsync,
    retryMax,
    span
}: {
    account: DBTeam;
    environment: DBEnvironment;
    connectionId: string;
    providerConfigKey: string;
    actionName: string;
    input?: unknown;
    isAsync: boolean;
    retryMax: number;
    span: Span;
}): Promise<ActionExecution> {
    let logCtx: LogContextOrigin | undefined;
    try {
        const { success, response: connection } = await connectionService.getConnection(connectionId, providerConfigKey, environment.id);
        if (!success || !connection) {
            return { logCtx, result: Err(new ActionExecutionError({ code: 'unknown_connection', message: 'Failed to find connection' })) };
        }

        const provider = await configService.getProviderConfig(providerConfigKey, environment.id);
        if (!provider) {
            return { logCtx, result: Err(new ActionExecutionError({ code: 'unknown_provider', message: 'Failed to find provider' })) };
        }

        const syncConfig = await getSyncConfigRaw({ environmentId: environment.id, config_id: provider.id!, name: actionName, isAction: true });
        if (!syncConfig) {
            return { logCtx, result: Err(new ActionExecutionError({ code: 'unknown_action', message: 'Action not found' })) };
        }

        if (!syncConfig.enabled) {
            return { logCtx, result: Err(new ActionExecutionError({ code: 'disabled_action', message: 'The action is disabled' })) };
        }

        span.setTag('nango.actionName', actionName)
            .setTag('nango.connectionId', connectionId)
            .setTag('nango.environmentId', environment.id)
            .setTag('nango.providerConfigKey', providerConfigKey);

        logCtx = await logContextGetter.create(
            { operation: { type: 'action', action: 'run' }, expiresAt: defaultOperationExpiration.action() },
            {
                account,
                environment,
                integration: { id: provider.id!, name: connection.provider_config_key, provider: provider.provider },
                connection: { id: connection.id, name: connection.connection_id },
                syncConfig: { id: syncConfig.id, name: syncConfig.sync_name },
                meta: truncateJson({ input })
            }
        );
        logCtx.attachSpan(new OtlpSpan(logCtx.operation));

        const actionResponse = await getOrchestrator().triggerAction({
            accountId: account.id,
            connection,
            actionName,
            input,
            async: isAsync,
            retryMax,
            maxConcurrency: envs.ACTION_ENVIRONMENT_MAX_CONCURRENCY,
            logCtx
        });

        if (actionResponse.isErr()) {
            span.setTag('nango.error', actionResponse.error);
            await logCtx.failed();
            return {
                logCtx,
                result: Err(new ActionExecutionError({ code: 'action_failed', message: actionResponse.error.message, nangoError: actionResponse.error }))
            };
        }

        void pubsub.publisher.publish({
            subject: 'usage',
            type: 'usage.actions',
            idempotencyKey: logCtx.id,
            payload: {
                value: 1,
                properties: {
                    accountId: account.id,
                    connectionId: connection.connection_id,
                    environmentId: environment.id,
                    environmentName: environment.name,
                    integrationId: providerConfigKey,
                    actionName
                }
            }
        });

        return { logCtx, result: Ok(actionResponse.value) };
    } catch (err) {
        span.setTag('nango.error', err);
        if (logCtx) {
            void logCtx.error('Failed to run action', { error: err });
            await logCtx.failed();
        }
        return { logCtx, result: Err(new ActionExecutionError({ code: 'internal_error', message: 'Failed to run action' })) };
    }
}
