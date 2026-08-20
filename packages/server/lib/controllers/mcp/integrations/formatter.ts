import { basePublicUrl } from '@nangohq/utils';

import { getPreconfiguredCredentials } from '../../../utils/integrations.js';

import type { IntegrationCredentials } from '../../../utils/integrations.js';
import type { IntegrationConfig, Provider } from '@nangohq/types';

export function integrationToMcp({
    integration,
    provider,
    webhookUrl,
    credentials
}: {
    integration: IntegrationConfig;
    provider: Provider;
    webhookUrl?: string | null;
    credentials?: IntegrationCredentials;
}) {
    const preconfiguredCredentials = getPreconfiguredCredentials(integration.custom, provider);

    return {
        unique_key: integration.unique_key,
        provider: integration.provider,
        display_name: integration.display_name || provider.display_name,
        logo: `${basePublicUrl}/images/template-logos/${integration.provider}.svg`,
        ...(provider.integration_config && integration.custom?.['keyLabel'] ? { credentials_label: { apiKey: integration.custom['keyLabel'] } } : {}),
        ...(preconfiguredCredentials.length > 0 ? { preconfigured_credentials: preconfiguredCredentials } : {}),
        ...(webhookUrl !== undefined ? { webhook_url: webhookUrl } : {}),
        ...(credentials !== undefined ? { credentials: integrationCredentialsToMcp(credentials) } : {}),
        forward_webhooks: integration.forward_webhooks === undefined ? true : integration.forward_webhooks,
        created_at: integration.created_at.toISOString(),
        updated_at: integration.updated_at.toISOString()
    };
}

export function integrationCredentialsToMcp(credentials: IntegrationCredentials) {
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
