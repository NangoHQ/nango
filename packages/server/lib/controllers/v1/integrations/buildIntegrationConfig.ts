import { configService } from '@nangohq/shared';
import { nanoid } from '@nangohq/utils';

import type { DBCreateIntegration, PostIntegration } from '@nangohq/types';

/**
 * Builds a DBCreateIntegration object from the POST integration body.
 * Handles unique_key generation, credential mapping, and all field transformations.
 *
 * @param body - The POST integration request body
 * @param provider - The provider configuration
 * @param environmentId - The environment ID
 * @param existingCount - The count of existing integrations with the same provider name (for unique_key generation)
 * @param clientId - Optional client ID (for MCP_OAUTH2)
 * @returns A DBCreateIntegration object ready to be passed to createProviderConfig
 */
export async function buildIntegrationConfig(body: PostIntegration['Body'], environmentId: number, mcpClientId?: string): Promise<DBCreateIntegration> {
    // Check for existing integrations to determine unique_key
    const exists = await configService.getIdByProviderConfigKey(environmentId, body.provider);

    // Determine unique_key
    let unique_key: string;
    if ('integrationId' in body && body.integrationId) {
        unique_key = body.integrationId;
    } else {
        unique_key = !exists ? body.provider : `${body.provider}-${nanoid(4).toLocaleLowerCase()}`;
    }

    // Start with base config
    const config: DBCreateIntegration = {
        environment_id: environmentId,
        unique_key,
        provider: body.provider,
        forward_webhooks: 'forward_webhooks' in body && body.forward_webhooks !== undefined ? body.forward_webhooks : true,
        shared_credentials_id: null,
        display_name: 'displayName' in body && body.displayName ? body.displayName : null,
        oauth_client_id: null,
        oauth_client_secret: null,
        oauth_scopes: null
    };

    // Handle webhook secret
    if ('webhookSecret' in body && body.webhookSecret) {
        config.custom = {
            webhookSecret: body.webhookSecret
        };
    }

    // Handle credentials based on authType
    if ('authType' in body) {
        if (body.authType === 'OAUTH1' || body.authType === 'OAUTH2' || body.authType === 'TBA') {
            config.oauth_client_id = body.clientId ?? null;
            config.oauth_client_secret = body.clientSecret ?? null;
            config.oauth_scopes = body.scopes ?? null;
        } else if (body.authType === 'APP') {
            config.oauth_client_id = body.appId ?? null;
            if (body.privateKey) {
                // This is a legacy thing
                config.oauth_client_secret = Buffer.from(body.privateKey).toString('base64');
            }
            config.app_link = body.appLink ?? null;
        } else if (body.authType === 'CUSTOM') {
            config.oauth_client_id = body.clientId ?? null;
            config.oauth_client_secret = body.clientSecret ?? null;
            config.app_link = body.appLink ?? null;
            // This is a legacy thing
            config.custom = {
                ...config.custom,
                ...(body.appId && { app_id: body.appId }),
                ...(body.privateKey && { private_key: Buffer.from(body.privateKey).toString('base64') })
            };
        } else if (body.authType === 'MCP_OAUTH2') {
            config.oauth_client_id = mcpClientId ?? null;
            config.oauth_client_secret = null;
            config.oauth_scopes = body.scopes ?? null;
        } else if (body.authType === 'MCP_OAUTH2_GENERIC') {
            const { clientName, clientUri, clientLogoUri } = body;
            config.custom = {
                ...config.custom,
                ...(clientName && { oauth_client_name: clientName }),
                ...(clientUri && { oauth_client_uri: clientUri }),
                ...(clientLogoUri && { oauth_client_logo_uri: clientLogoUri })
            };
        }
    } else if (mcpClientId) {
        // MCP_OAUTH2 without explicit authType in body
        config.oauth_client_id = mcpClientId;
    }

    return config;
}
