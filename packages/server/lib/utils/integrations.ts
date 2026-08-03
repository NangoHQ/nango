import type { IntegrationConfig, Provider } from '@nangohq/types';

export type IntegrationCredentials =
    | {
          type: 'OAUTH1' | 'OAUTH2' | 'TBA';
          clientId: string | null;
          clientSecret: string | null;
          scopes: string | null;
          webhookSecret: string | null;
      }
    | { type: 'APP'; appId: string | null; privateKey: string | null; appLink: string | null }
    | {
          type: 'CUSTOM';
          clientId: string | null;
          clientSecret: string | null;
          appId: string | null;
          appLink: string | null;
          privateKey: string | null;
      }
    | null;

export function getPreconfiguredCredentials(custom: IntegrationConfig['custom'], provider: Provider): string[] {
    if (!custom || provider.auth_mode !== 'TWO_STEP' || !provider.integration_config) {
        return [];
    }

    return Object.keys(provider.integration_config).filter((field) => Boolean(custom[field]));
}

export function getIntegrationCredentials(integration: IntegrationConfig, provider: Provider): IntegrationCredentials {
    const usesSharedCredentials = Boolean(integration.shared_credentials_id);

    if (provider.auth_mode === 'OAUTH1' || provider.auth_mode === 'OAUTH2' || provider.auth_mode === 'TBA') {
        return {
            type: provider.auth_mode,
            clientId: usesSharedCredentials ? '' : integration.oauth_client_id,
            clientSecret: usesSharedCredentials ? '' : integration.oauth_client_secret,
            scopes: integration.oauth_scopes || null,
            webhookSecret: integration.custom?.['webhookSecret'] || null
        };
    }

    if (provider.auth_mode === 'APP') {
        return {
            type: provider.auth_mode,
            appId: usesSharedCredentials ? '' : integration.oauth_client_id,
            privateKey: usesSharedCredentials ? '' : integration.oauth_client_secret,
            appLink: integration.app_link || null
        };
    }

    if (provider.auth_mode === 'CUSTOM') {
        const rawPrivateKey = integration.custom?.['private_key'];
        return {
            type: provider.auth_mode,
            clientId: usesSharedCredentials ? '' : integration.oauth_client_id,
            clientSecret: usesSharedCredentials ? '' : integration.oauth_client_secret,
            appId: usesSharedCredentials ? '' : integration.custom?.['app_id'] || null,
            appLink: integration.app_link || null,
            privateKey: usesSharedCredentials ? '' : rawPrivateKey ? Buffer.from(rawPrivateKey, 'base64').toString('utf8') : null
        };
    }

    return null;
}
