import { getProvider } from '@nangohq/shared';
import { basePublicUrl } from '@nangohq/utils';

import { getPreconfiguredConnectionConfig, getPreconfiguredCredentials } from '../utils/integrations.js';

import type { IntegrationCredentials } from '../utils/integrations.js';
import type { ApiIntegration, ApiPublicIntegration, ApiPublicIntegrationInclude, IntegrationConfig, Provider } from '@nangohq/types';

export function integrationToApi(data: IntegrationConfig, options?: { includeCredentials?: boolean }): ApiIntegration {
    const hideCredentials = options?.includeCredentials === false || !!data.shared_credentials_id;
    const provider = getProvider(data.provider);
    return {
        id: data.id,
        unique_key: data.unique_key,
        provider: data.provider,
        oauth_client_id: hideCredentials ? '' : data.oauth_client_id,
        oauth_client_secret: hideCredentials ? '' : data.oauth_client_secret,
        oauth_scopes: data.oauth_scopes,
        environment_id: data.environment_id,
        app_link: hideCredentials ? null : data.app_link,
        custom:
            options?.includeCredentials === false
                ? null
                : data.shared_credentials_id
                  ? pickSafeCustomFields(data.custom)
                  : hideCredentials
                    ? null
                    : maskSecretConfigFields(data.custom, provider),
        created_at: data.created_at.toISOString(),
        updated_at: data.updated_at.toISOString(),
        missing_fields: data.missing_fields,
        display_name: data.display_name,
        forward_webhooks: data.forward_webhooks === undefined ? true : data.forward_webhooks,
        shared_credentials_id: data.shared_credentials_id
    };
}

/**
 * Mask `custom` values for any `integration_config` field the provider declares as `secret`, so
 * secrets (e.g. AWS SigV4 built-in credentials, sage-intacct-cc's clientSecret) are never echoed in
 * cleartext. The "***" sentinel is what the dynamic settings form treats as "configured but
 * unchanged" — it omits such a field on save, and the resolver preserves omitted fields in patch mode.
 */
function maskSecretConfigFields(custom: IntegrationConfig['custom'], provider: Provider | null): IntegrationConfig['custom'] {
    if (!custom || !provider?.integration_config) {
        return custom;
    }

    let masked: Record<string, string> | undefined;
    for (const [field, definition] of Object.entries(provider.integration_config)) {
        if (definition.secret && custom[field]) {
            masked = masked ?? { ...custom };
            masked[field] = '***';
        }
    }

    return masked ?? custom;
}

function pickSafeCustomFields(custom: IntegrationConfig['custom']): IntegrationConfig['custom'] {
    if (!custom?.['webhookSecret']) {
        return null;
    }
    return { webhookSecret: custom['webhookSecret'] };
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
    const preconfiguredCredentials = getPreconfiguredCredentials(integration.custom, provider);
    const preconfiguredConnectionConfig = getPreconfiguredConnectionConfig(integration.custom, provider);
    return {
        unique_key: integration.unique_key,
        provider: integration.provider,
        display_name: integration.display_name || provider.display_name,
        logo: `${basePublicUrl}/images/template-logos/${integration.provider}.svg`,
        // Non-secret per-integration overrides for the Connect UI (e.g. the configurable API-key label).
        // Only providers that declare `integration_config`, never expose the whole `custom` object.
        ...(provider.integration_config && integration.custom?.['keyLabel'] ? { credentials_label: { apiKey: integration.custom['keyLabel'] } } : {}),
        ...(preconfiguredCredentials.length > 0 ? { preconfigured_credentials: preconfiguredCredentials } : {}),
        ...(preconfiguredConnectionConfig.length > 0 ? { preconfigured_connection_config: preconfiguredConnectionConfig } : {}),
        ...include,
        forward_webhooks: integration.forward_webhooks === undefined ? true : integration.forward_webhooks,
        created_at: integration.created_at.toISOString(),
        updated_at: integration.updated_at.toISOString()
    };
}

export function integrationCredentialsToPublicApi(credentials: IntegrationCredentials): Exclude<ApiPublicIntegrationInclude['credentials'], undefined> {
    if (!credentials) {
        return null;
    }

    switch (credentials.type) {
        case 'OAUTH1':
        case 'OAUTH2':
        case 'TBA':
            return {
                type: credentials.type,
                client_id: credentials.clientId,
                client_secret: credentials.clientSecret,
                scopes: credentials.scopes,
                webhook_secret: credentials.webhookSecret
            };
        case 'APP':
            return {
                type: credentials.type,
                app_id: credentials.appId,
                private_key: credentials.privateKey,
                app_link: credentials.appLink
            };
        case 'CUSTOM':
            return {
                type: credentials.type,
                client_id: credentials.clientId,
                client_secret: credentials.clientSecret,
                app_id: credentials.appId,
                app_link: credentials.appLink,
                private_key: credentials.privateKey
            };
    }
}
