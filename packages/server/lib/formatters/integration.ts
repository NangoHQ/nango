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
        custom: hideCredentials ? null : redactAwsSigV4Secrets(data.custom),
        created_at: data.created_at.toISOString(),
        updated_at: data.updated_at.toISOString(),
        missing_fields: data.missing_fields,
        display_name: data.display_name,
        forward_webhooks: data.forward_webhooks === undefined ? true : data.forward_webhooks,
        shared_credentials_id: data.shared_credentials_id
    };
}

/**
 * Redact AWS SigV4 secrets from the custom blob before it leaves the API. Secrets live inside the
 * (encrypted) custom blob — built-in static AWS credentials for `builtin` mode, and the STS endpoint
 * auth value/password for `custom` mode — so they must be masked here, never echoed in cleartext.
 * The editor UI treats "***" as "configured but unchanged" and omits the field on save.
 */
function redactAwsSigV4Secrets(custom: IntegrationConfig['custom']): IntegrationConfig['custom'] {
    const raw = custom?.[awsSigV4Client.AWS_SIGV4_CUSTOM_KEY];
    if (!raw) {
        return custom;
    }

    try {
        const parsed = JSON.parse(raw);
        let redacted = false;

        if (parsed.awsAccessKeyId) {
            parsed.awsAccessKeyId = '***';
            redacted = true;
        }
        if (parsed.awsSecretAccessKey) {
            parsed.awsSecretAccessKey = '***';
            redacted = true;
        }

        if (parsed.stsEndpoint?.auth) {
            // Redact known secret fields; for unknown types or missing required secrets, strip the
            // auth block entirely rather than returning a raw value (which could leak unvetted structure).
            if (parsed.stsEndpoint.auth.type === 'api_key' && parsed.stsEndpoint.auth.value) {
                parsed.stsEndpoint.auth.value = '***';
                redacted = true;
            } else if (parsed.stsEndpoint.auth.type === 'basic' && parsed.stsEndpoint.auth.password) {
                parsed.stsEndpoint.auth.password = '***';
                redacted = true;
            } else {
                parsed.stsEndpoint = { ...parsed.stsEndpoint };
                delete parsed.stsEndpoint.auth;
                redacted = true;
            }
        }

        if (!redacted) {
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
        // Non-secret per-integration overrides for the Connect UI (e.g. the configurable API-key label).
        // Only providers that declare `integration_config`, never expose the whole `custom` object.
        ...(provider.integration_config && integration.custom?.['keyLabel'] ? { credentials_label: { apiKey: integration.custom['keyLabel'] } } : {}),
        ...include,
        forward_webhooks: integration.forward_webhooks === undefined ? true : integration.forward_webhooks,
        created_at: integration.created_at.toISOString(),
        updated_at: integration.updated_at.toISOString()
    };
}
