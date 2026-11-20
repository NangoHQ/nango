import { configService, sharedCredentialsService } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { buildIntegrationConfig } from '../controllers/v1/integrations/buildIntegrationConfig.js';
import { resolveIntegrationConfig } from './integrationConfig.js';
import { cleanupMcpClientRegistration, mcpRegistrationCustomFields, registerMcpOAuth2Client } from './mcpClientRegistration.js';

import type { DBEnvironment, DBTeam, IntegrationConfig, PostIntegration, Provider, ProviderMcpOAUTH2 } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export class CreateIntegrationError extends Error {
    constructor(
        public readonly code: 'invalid_body' | 'server_error',
        message: string
    ) {
        super(message);
        this.name = 'CreateIntegrationError';
    }
}

const invalid = (message: string): CreateIntegrationError => new CreateIntegrationError('invalid_body', message);

export async function createIntegration({
    body,
    provider,
    environment,
    account
}: {
    body: PostIntegration['Body'];
    provider: Provider;
    environment: DBEnvironment;
    account: DBTeam;
}): Promise<Result<IntegrationConfig, CreateIntegrationError>> {
    if (body.integrationId) {
        const exists = await configService.getIdByProviderConfigKey(environment.id, body.integrationId);
        if (exists) {
            return Err(invalid('integrationId is already used by another integration'));
        }
    }

    if (body.auth && 'authType' in body.auth && body.auth.authType !== provider.auth_mode) {
        return Err(invalid('incompatible credentials auth type and provider auth'));
    }

    if (provider.integration_config || body.integrationConfig) {
        if (body.useSharedCredentials) {
            return Err(invalid('integrationConfig is not supported with shared credentials'));
        }
        const result = resolveIntegrationConfig(provider, body.integrationConfig ?? {});
        if (result.isErr()) {
            return Err(invalid(result.error.message));
        }
        body = { ...body, integrationConfig: result.value };
    }

    if (body.useSharedCredentials) {
        const result = await sharedCredentialsService.createPreprovisionedProvider({
            providerName: body.provider,
            environment_id: environment.id,
            provider,
            ...(body.integrationId && { unique_key: body.integrationId }),
            ...(body.displayName && { display_name: body.displayName })
        });
        return result.isErr() ? Err(invalid(result.error.message)) : Ok(result.value);
    }

    const config = await buildIntegrationConfig(body, environment.id);

    let mcpRegistration = null;
    if (provider.auth_mode === 'MCP_OAUTH2') {
        const clientRegistration = (provider as ProviderMcpOAUTH2).client_registration;
        if (clientRegistration !== 'static' && (config.oauth_client_id || config.oauth_client_secret)) {
            return Err(invalid(`Client credentials can't be set for ${clientRegistration} client registration`));
        }

        const registration = await registerMcpOAuth2Client({ provider, uniqueKey: config.unique_key, environment, team: account });
        if (registration.isErr()) {
            return Err(invalid(registration.error.message));
        }
        if (registration.value) {
            mcpRegistration = registration.value;
            config.oauth_client_id = registration.value.oauth_client_id;
            config.oauth_client_secret = registration.value.oauth_client_secret;
            const registrationCustom = mcpRegistrationCustomFields(registration.value);
            if (registrationCustom) {
                config.custom = { ...config.custom, ...registrationCustom };
            }
        } else if (!config.oauth_client_id || !config.oauth_client_secret) {
            // static: client_id/secret must come from body.auth -- registerMcpOAuth2Client() doesn't
            // act on 'static' providers, so this is the only place that can catch them missing.
            return Err(invalid('Missing credentials'));
        }
    }

    let created: IntegrationConfig | null;
    try {
        created = await configService.createProviderConfig(config, provider);
    } catch (err) {
        await cleanupMcpClientRegistration(mcpRegistration, provider);
        throw err;
    }
    if (!created) {
        await cleanupMcpClientRegistration(mcpRegistration, provider);
        return Err(new CreateIntegrationError('server_error', 'Failed to create integration'));
    }
    return Ok(created);
}
