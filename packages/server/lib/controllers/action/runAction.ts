import { OtlpSpan, defaultOperationExpiration, logContextGetter } from '@nangohq/logs';
import { configService, connectionService, errorManager, getSyncConfigRaw } from '@nangohq/shared';
import { truncateJson } from '@nangohq/utils';

import { envs } from '../../env.js';
import { pubsub } from '../../pubsub.js';
import { getOrchestrator } from '../../utils/utils.js';

import type { LogContextOrigin } from '@nangohq/logs';
import type { DBEnvironment, DBTeam } from '@nangohq/types';
import type { Span } from 'dd-trace';
import type { Response } from 'express';

/**
 * Core action execution logic shared between the public trigger endpoint and the
 * internal session-authenticated trigger function endpoint.
 *
 * Returns the created `LogContextOrigin` so callers can attach additional metadata
 * (e.g. enrichOperation) in their own finally blocks.
 */
export async function runAction({
    account,
    environment,
    connectionId,
    providerConfigKey,
    actionName,
    input,
    isAsync,
    retryMax,
    res,
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
    res: Response;
    span: Span;
}): Promise<LogContextOrigin | undefined> {
    let logCtx: LogContextOrigin | undefined;
    try {
        const { success, response: connection } = await connectionService.getConnection(connectionId, providerConfigKey, environment.id);
        if (!success || !connection) {
            res.status(400).send({ error: { code: 'unknown_connection', message: 'Failed to find connection' } });
            return logCtx;
        }

        const provider = await configService.getProviderConfig(providerConfigKey, environment.id);
        if (!provider) {
            res.status(400).json({ error: { code: 'unknown_provider', message: 'Failed to find provider' } });
            return logCtx;
        }

        const syncConfig = await getSyncConfigRaw({ environmentId: environment.id, config_id: provider.id!, name: actionName, isAction: true });
        if (!syncConfig) {
            res.status(404).json({ error: { code: 'not_found', message: 'Action not found' } });
            return logCtx;
        }

        if (!syncConfig.enabled) {
            res.status(404).json({ error: { code: 'disabled_resource', message: 'The action is disabled' } });
            return logCtx;
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

        if (actionResponse.isOk()) {
            if ('statusUrl' in actionResponse.value) {
                res.status(202).location(actionResponse.value.statusUrl).json(actionResponse.value);
            } else {
                res.status(200).json(actionResponse.value.data);
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
        } else {
            span.setTag('nango.error', actionResponse.error);
            await logCtx.failed();
            errorManager.errResFromNangoErr(res, actionResponse.error);
        }
    } catch (err) {
        span.setTag('nango.error', err);
        if (logCtx) {
            void logCtx.error('Failed to run action', { error: err });
            await logCtx.failed();
        }
        res.status(500).send({ error: { code: 'internal_server_error', message: 'Failed to run action' } });
    }

    return logCtx;
}
