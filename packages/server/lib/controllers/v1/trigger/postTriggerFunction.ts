import tracer from 'dd-trace';
import * as z from 'zod';

import { OtlpSpan, defaultOperationExpiration, logContextGetter } from '@nangohq/logs';
import { records as recordsService } from '@nangohq/records';
import { SyncCommand, configService, connectionService, errorManager, getSyncConfigRaw, syncManager } from '@nangohq/shared';
import { metrics, zodErrorToHTTP } from '@nangohq/utils';

import { envs } from '../../../env.js';
import { connectionIdSchema, providerConfigKeySchema, syncNameSchema } from '../../../helpers/validation.js';
import { pubsub } from '../../../pubsub.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../../utils/utils.js';
import { normalizeSyncParams } from '../../sync/helpers.js';

import type { LogContextOrigin } from '@nangohq/logs';
import type { PostInternalTriggerFunction } from '@nangohq/types';

const bodySchema = z.discriminatedUnion('type', [
    z.strictObject({
        type: z.literal('action'),
        function_name: syncNameSchema,
        provider_config_key: providerConfigKeySchema,
        connection_id: connectionIdSchema,
        input: z.unknown().optional()
    }),
    z.strictObject({
        type: z.literal('sync'),
        function_name: syncNameSchema,
        provider_config_key: providerConfigKeySchema,
        connection_id: connectionIdSchema
    })
]);

const orchestrator = getOrchestrator();

export const postTriggerFunction = asyncWrapper<PostInternalTriggerFunction>(async (req, res) => {
    const valBody = bodySchema.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const { account, environment } = res.locals;
    const { type, function_name, provider_config_key, connection_id } = valBody.data;

    if (type === 'action') {
        const { input } = valBody.data;

        metrics.increment(metrics.Types.ACTION_INCOMING_PAYLOAD_SIZE_BYTES, req.rawBody ? Buffer.byteLength(req.rawBody) : 0, { accountId: account.id });

        await tracer.trace<Promise<void>>('server.trigger.action', async (span) => {
            let logCtx: LogContextOrigin | undefined;
            try {
                const { success, response: connection } = await connectionService.getConnection(connection_id, provider_config_key, environment.id);
                if (!success || !connection) {
                    res.status(400).send({ error: { code: 'unknown_connection', message: 'Failed to find connection' } });
                    return;
                }

                const provider = await configService.getProviderConfig(provider_config_key, environment.id);
                if (!provider) {
                    res.status(400).json({ error: { code: 'unknown_provider', message: 'Failed to find provider' } });
                    return;
                }

                const syncConfig = await getSyncConfigRaw({ environmentId: environment.id, config_id: provider.id!, name: function_name, isAction: true });
                if (!syncConfig) {
                    res.status(404).json({ error: { code: 'not_found', message: 'Action not found' } });
                    return;
                }

                if (!syncConfig.enabled) {
                    res.status(404).json({ error: { code: 'disabled_resource', message: 'The action is disabled' } });
                    return;
                }

                span.setTag('nango.actionName', function_name)
                    .setTag('nango.connectionId', connection_id)
                    .setTag('nango.environmentId', environment.id)
                    .setTag('nango.providerConfigKey', provider_config_key);

                logCtx = await logContextGetter.create(
                    { operation: { type: 'action', action: 'run' }, expiresAt: defaultOperationExpiration.action() },
                    {
                        account,
                        environment,
                        integration: { id: provider.id!, name: connection.provider_config_key, provider: provider.provider },
                        connection: { id: connection.id, name: connection.connection_id },
                        syncConfig: { id: syncConfig.id, name: syncConfig.sync_name },
                        meta: { input }
                    }
                );
                logCtx.attachSpan(new OtlpSpan(logCtx.operation));

                const actionResponse = await orchestrator.triggerAction({
                    accountId: account.id,
                    connection,
                    actionName: function_name,
                    input,
                    async: false,
                    retryMax: 0,
                    maxConcurrency: envs.ACTION_ENVIRONMENT_MAX_CONCURRENCY,
                    logCtx
                });

                if (actionResponse.isOk()) {
                    const responseData = 'statusUrl' in actionResponse.value ? actionResponse.value : actionResponse.value.data;
                    res.status(200).json(responseData);

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
                                integrationId: provider_config_key,
                                actionName: function_name
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
        });
    } else {
        const syncIdentifiers = normalizeSyncParams([function_name]);

        const { success, error } = await syncManager.runSyncCommand({
            recordsService,
            orchestrator,
            environment,
            providerConfigKey: provider_config_key,
            syncIdentifiers,
            command: SyncCommand.RUN,
            logContextGetter,
            connectionId: connection_id,
            initiator: 'UI'
        });

        if (!success) {
            errorManager.errResFromNangoErr(res, error);
            return;
        }

        res.status(200).send({ success: true });
    }
});
