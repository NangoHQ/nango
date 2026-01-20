import tracer from 'dd-trace';
import * as z from 'zod';

import { OtlpSpan, defaultOperationExpiration, logContextGetter } from '@nangohq/logs';
import { configService, connectionService, errorManager, getSyncConfigRaw } from '@nangohq/shared';
import { getHeaders, metrics, redactHeaders, requireEmptyQuery, truncateJson, zodErrorToHTTP } from '@nangohq/utils';

import { envs } from '../../env.js';
import { connectionIdSchema, providerConfigKeySchema, syncNameSchema } from '../../helpers/validation.js';
import { pubsub } from '../../pubsub.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../utils/utils.js';

import type { LogContextOrigin } from '@nangohq/logs';
import type { PostPublicTriggerAction } from '@nangohq/types';

const schemaHeaders = z.object({
    'provider-config-key': providerConfigKeySchema,
    'connection-id': connectionIdSchema,
    'x-async': z.stringbool().optional().default(false),
    'x-max-retries': z.coerce.number().min(0).max(5).optional().default(0)
});

const schemaBody = z.object({
    action_name: syncNameSchema,
    input: z.unknown()
});

export const postPublicTriggerAction = asyncWrapper<PostPublicTriggerAction>(async (req, res) => {
    const valHeaders = schemaHeaders.safeParse(req.headers);
    if (!valHeaders.success) {
        res.status(400).send({ error: { code: 'invalid_headers', errors: zodErrorToHTTP(valHeaders.error) } });
        return;
    }

    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = schemaBody.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const { account, environment } = res.locals;
    metrics.increment(metrics.Types.ACTION_INCOMING_PAYLOAD_SIZE_BYTES, req.rawBody ? Buffer.byteLength(req.rawBody) : 0, { accountId: account.id });

    await tracer.trace<Promise<void>>('server.sync.triggerAction', async (span) => {
        const { input, action_name }: PostPublicTriggerAction['Body'] = valBody.data;

        const environmentId = environment.id;
        const headers: PostPublicTriggerAction['Headers'] = valHeaders.data;

        const async = headers['x-async']!;
        const retryMax = headers['x-max-retries']!;
        const connectionId = headers['connection-id'];
        const providerConfigKey = headers['provider-config-key'];

        let logCtx: LogContextOrigin | undefined;
        try {
            const { success, response: connection } = await connectionService.getConnection(connectionId, providerConfigKey, environmentId);
            if (!success || !connection) {
                res.status(400).send({ error: { code: 'unknown_connection', message: 'Failed to find connection' } });
                return;
            }

            const provider = await configService.getProviderConfig(providerConfigKey, environmentId);
            if (!provider) {
                res.status(400).json({ error: { code: 'unknown_provider', message: 'Failed to find provider' } });
                return;
            }

            const syncConfig = await getSyncConfigRaw({ environmentId, config_id: provider.id!, name: action_name, isAction: true });
            if (!syncConfig) {
                res.status(404).json({ error: { code: 'not_found', message: 'Action not found' } });
                return;
            }

            if (!syncConfig.enabled) {
                res.status(404).json({ error: { code: 'disabled_resource', message: 'The action is disabled' } });
                return;
            }

            span.setTag('nango.actionName', action_name)
                .setTag('nango.connectionId', connectionId)
                .setTag('nango.environmentId', environmentId)
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
                actionName: action_name,
                input,
                async,
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
                            actionName: action_name
                        }
                    }
                });

                return;
            } else {
                span.setTag('nango.error', actionResponse.error);
                await logCtx.failed();

                errorManager.errResFromNangoErr(res, actionResponse.error);

                return;
            }
        } catch (err) {
            span.setTag('nango.error', err);
            if (logCtx) {
                void logCtx.error('Failed to run action', { error: err });
                await logCtx.failed();
            }

            res.status(500).send({ error: { code: 'internal_server_error', message: 'Failed to run action' } });
        } finally {
            const reqHeaders = getHeaders(req.headers);
            const responseHeaders = getHeaders(res.getHeaders());
            await logCtx?.enrichOperation({
                request: {
                    url: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
                    method: req.method,
                    headers: redactHeaders({ headers: reqHeaders })
                },
                response: {
                    code: res.statusCode,
                    headers: redactHeaders({ headers: responseHeaders })
                }
            });
        }
    });
});
