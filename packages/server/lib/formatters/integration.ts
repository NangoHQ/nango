import { awsSigV4Client } from '@nangohq/shared';
import { basePublicUrl } from '@nangohq/utils';

import type { ApiIntegration, ApiPublicIntegration, ApiPublicIntegrationInclude, IntegrationConfig, Provider } from '@nangohq/types';

export function integrationToApi(data: IntegrationConfig, options?: { includeCredentials?: boolean }): ApiIntegration {
    const hideCredentials = options?.includeCredentials === false || !!data.shared_credentials_id;
    return {
        id: data.id,
        unique_key: data.unique_key,
        provider: data.provider,
        oauth_client_id: hideCredentials ? '' : data.oauth_client_id,
        oauth_client_secret: hideCredentials ? '' : data.oauth_client_secret,
        oauth_scopes: data.oauth_scopes,
        environment_id: data.environment_id,
        app_link: data.app_link,
        custom: hideCredentials ? null : redactAwsSigV4Secrets(data.custom, data.integration_secrets),
        created_at: data.created_at.toISOString(),
        updated_at: data.updated_at.toISOString(),
        missing_fields: data.missing_fields,
        display_name: data.display_name,
        forward_webhooks: data.forward_webhooks === undefined ? true : data.forward_webhooks,
        shared_credentials_id: data.shared_credentials_id
    };
}

/**
 * Redact STS auth secrets from the custom blob for API responses.
 * For legacy data (auth in custom blob): replaces secret values with "***".
 * For migrated data (auth in integration_secrets): injects redacted auth metadata into the custom blob.
 */
function redactAwsSigV4Secrets(custom: IntegrationConfig['custom'], integrationSecrets: IntegrationConfig['integration_secrets']): IntegrationConfig['custom'] {
    const raw = custom?.[awsSigV4Client.AWS_SIGV4_CUSTOM_KEY];
    if (!raw) {
        return custom;
    }

    try {
        const parsed = JSON.parse(raw);
        const secrets = integrationSecrets as Record<string, any> | undefined | null;
        const stsAuth = secrets?.['aws_sigv4']?.['sts_auth'];

        if (stsAuth) {
            // Migrated: inject redacted auth from integration_secrets
            if (stsAuth['type'] === 'api_key') {
                parsed.stsEndpoint = { ...parsed.stsEndpoint, auth: { type: 'api_key', header: stsAuth['header'] || 'x-api-key', value: '***' } };
            } else if (stsAuth['type'] === 'basic') {
                parsed.stsEndpoint = { ...parsed.stsEndpoint, auth: { type: 'basic', username: stsAuth['username'] || '', password: '***' } };
            }
        } else if (parsed.stsEndpoint?.auth) {
            // Legacy: auth lives in custom blob. Redact known secret fields; for unknown types or
            // missing required secrets, strip the auth block entirely rather than returning the
            // raw value (which could leak unvetted secret structure).
            if (parsed.stsEndpoint.auth.type === 'api_key' && parsed.stsEndpoint.auth.value) {
                parsed.stsEndpoint.auth.value = '***';
            } else if (parsed.stsEndpoint.auth.type === 'basic' && parsed.stsEndpoint.auth.password) {
                parsed.stsEndpoint.auth.password = '***';
            } else {
                parsed.stsEndpoint = { ...parsed.stsEndpoint };
                delete parsed.stsEndpoint.auth;
            }
        } else {
            return custom;
        }

        return { ...custom, [awsSigV4Client.AWS_SIGV4_CUSTOM_KEY]: JSON.stringify(parsed) };
    } catch {
        return custom;
    }
}

export function integrationToPublicApi({
    integration,
    include,
    provider
}: {
    integration: IntegrationConfig;
    provider: Provider;
    include?: ApiPublicIntegrationInclude;
}): ApiPublicIntegration {
    return {
        unique_key: integration.unique_key,
        provider: integration.provider,
        display_name: integration.display_name || provider.display_name,
        logo: `${basePublicUrl}/images/template-logos/${integration.provider}.svg`,
        ...include,
        forward_webhooks: integration.forward_webhooks === undefined ? true : integration.forward_webhooks,
        created_at: integration.created_at.toISOString(),
        updated_at: integration.updated_at.toISOString()
    };
}
