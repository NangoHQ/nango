import { configService, getProvider, sharedCredentialsService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { integrationToApi } from '../../../formatters/integration.js';
import { resolveIntegrationConfig } from '../../../services/integrationConfig.js';
import { cleanupMcpClientRegistration, registerMcpOAuth2Client } from '../../../services/mcpClientRegistration.js';
import { asyncWrapperWithEnvironment } from '../../../utils/asyncWrapper.js';
import { buildIntegrationConfig } from './buildIntegrationConfig.js';
import { postIntegrationBodySchema } from './validation.js';

import type { IntegrationConfig, PostIntegration } from '@nangohq/types';

export const postIntegration = asyncWrapperWithEnvironment<PostIntegration>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = postIntegrationBodySchema.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({
            error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) }
        });
        return;
    }

    const body: PostIntegration['Body'] = valBody.data;
    const provider = getProvider(body.provider);
    if (!provider) {
        res.status(400).send({
            error: { code: 'invalid_body', message: 'invalid provider' }
        });
        return;
    }

    const { environment, account } = res.locals;

    if ('integrationId' in body && body.integrationId) {
        const exists = await configService.getIdByProviderConfigKey(environment.id, body.integrationId);
        if (exists) {
            res.status(400).send({ error: { code: 'invalid_body', message: 'integrationId is already used by another integration' } });
            return;
        }
    }

    if ('auth' in body && body.auth && 'authType' in body.auth && body.auth.authType !== provider.auth_mode) {
        res.status(400).send({ error: { code: 'invalid_body', message: 'incompatible credentials auth type and provider auth' } });
        return;
    }

    if (provider.integration_config || body.integrationConfig) {
        if (body.useSharedCredentials) {
            res.status(400).send({ error: { code: 'invalid_body', message: 'integrationConfig is not supported with shared credentials' } });
            return;
        }
        const result = resolveIntegrationConfig(provider, body.integrationConfig ?? {});
        if (result.isErr()) {
            res.status(400).send({ error: { code: 'invalid_body', message: result.error.message } });
            return;
        }
        body.integrationConfig = result.value;
    }

    let integration: IntegrationConfig;
    if (body.useSharedCredentials) {
        const createParams: {
            providerName: string;
            environment_id: number;
            provider: typeof provider;
            unique_key?: string;
            display_name?: string;
        } = {
            providerName: body.provider,
            environment_id: environment.id,
            provider
        };
        if ('integrationId' in body && body.integrationId) {
            createParams.unique_key = body.integrationId;
        }
        if ('displayName' in body && body.displayName) {
            createParams.display_name = body.displayName;
        }
        const result = await sharedCredentialsService.createPreprovisionedProvider(createParams);
        if (result.isErr()) {
            res.status(400).send({
                error: { code: 'invalid_body', message: result.error.message }
            });
            return;
        }
        integration = result.value;
    } else {
        const config = await buildIntegrationConfig(body, environment.id);

        let mcpRegistration = null;
        if (provider.auth_mode === 'MCP_OAUTH2') {
            const registration = await registerMcpOAuth2Client({ provider, uniqueKey: config.unique_key, environment, team: account });
            if (registration.isErr()) {
                res.status(400).send({ error: { code: 'invalid_body', message: registration.error.message } });
                return;
            }
            if (registration.value) {
                mcpRegistration = registration.value;
                config.oauth_client_id = registration.value.oauth_client_id;
                config.oauth_client_secret = registration.value.oauth_client_secret;
            }
            // static: client_id/secret come from body.auth
        }

        const createdIntegration = await configService.createProviderConfig(config, provider);
        if (!createdIntegration) {
            await cleanupMcpClientRegistration(mcpRegistration);
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to create integration' } });
            return;
        }
        integration = createdIntegration;
    }

    res.status(200).send({
        data: integrationToApi(integration)
    });
});
