import * as z from 'zod';

import { logContextGetter } from '@nangohq/logs';
import { configService, connectionService, getProvider } from '@nangohq/shared';
import { requireEmptyBody, zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema, envSchema, providerConfigKeySchema } from '../../../../helpers/validation.js';
import { connectionTestSupported, testConnectionCredentials } from '../../../../hooks/hooks.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { ApiKeyCredentials, BasicApiCredentials, JwtCredentials, PostConnectionTest, SignatureCredentials, TbaCredentials } from '@nangohq/types';

const queryStringValidation = z
    .object({
        provider_config_key: providerConfigKeySchema,
        env: envSchema
    })
    .strict();

const paramValidation = z
    .object({
        connectionId: connectionIdSchema
    })
    .strict();

export const postConnectionTest = asyncWrapper<PostConnectionTest>(async (req, res) => {
    const emptyBody = requireEmptyBody(req);
    if (emptyBody) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(emptyBody.error) } });
        return;
    }

    const queryParamValues = queryStringValidation.safeParse(req.query);
    if (!queryParamValues.success) {
        res.status(400).send({
            error: { code: 'invalid_query_params', errors: zodErrorToHTTP(queryParamValues.error) }
        });
        return;
    }

    const paramValue = paramValidation.safeParse(req.params);
    if (!paramValue.success) {
        res.status(400).send({
            error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(paramValue.error) }
        });
        return;
    }

    const { environment, account } = res.locals;

    const queryParams = queryParamValues.data;
    const params = paramValue.data;

    const { provider_config_key: providerConfigKey } = queryParams;
    const { connectionId } = params;

    const integration = await configService.getProviderConfig(providerConfigKey, environment.id);
    if (!integration) {
        res.status(404).send({
            error: {
                code: 'unknown_provider_config',
                message: 'Provider config not found for the given provider config key. Please make sure the provider config exists in the Nango dashboard.'
            }
        });
        return;
    }

    const connectionRes = await connectionService.getConnection(connectionId, providerConfigKey, environment.id);
    if (connectionRes.error || !connectionRes.response) {
        res.status(404).send({ error: { code: 'not_found', message: 'Failed to find connection' } });
        return;
    }

    const connection = connectionRes.response;

    const provider = getProvider(integration.provider);
    if (!provider) {
        res.status(404).send({ error: { code: 'not_found', message: 'Provider not found' } });
        return;
    }

    // Check if connection testing is supported for this connection and provider
    if (!connectionTestSupported({ connection, provider })) {
        res.status(400).send({
            error: {
                code: 'connection_test_failed',
                message: `Connection testing is not supported for ${connection.credentials.type} credential type`
            }
        });
        return;
    }

    if (!integration.id) {
        res.status(500).send({ error: { code: 'server_error', message: 'Integration ID is missing' } });
        return;
    }

    const logCtx = await logContextGetter.create(
        { operation: { type: 'auth', action: 'connection_test' } },
        {
            account,
            environment,
            integration: { id: integration.id, name: integration.unique_key, provider: integration.provider },
            connection: { id: connection.id, name: connection.connection_id }
        }
    );

    const testResult = await testConnectionCredentials({
        config: integration,
        connectionConfig: connection.connection_config,
        connectionId: connection.connection_id,
        credentials: connection.credentials as ApiKeyCredentials | BasicApiCredentials | TbaCredentials | JwtCredentials | SignatureCredentials,
        provider,
        logCtx
    });

    if (testResult.isErr()) {
        void logCtx.error('Connection test failed', { error: testResult.error });
        await logCtx.failed();

        res.status(400).send({
            error: {
                code: 'connection_test_failed',
                message: testResult.error.message || 'Connection test failed'
            }
        });
        return;
    }

    void logCtx.info(`Connection test successful for ${providerConfigKey} and connection ${connectionId}`);
    await logCtx.success();

    res.status(200).send({
        data: {
            tested: testResult.value.tested
        }
    });
});
