import { configService } from '@nangohq/shared';
import { nanoid } from '@nangohq/utils';

import type { DBCreateIntegration, PostIntegration } from '@nangohq/types';

/**
 * Builds a DBCreateIntegration object from the POST integration body.
 * Handles unique_key generation, credential mapping, and all field transformations.
 *
 * @param body - The POST integration request body
 * @param environmentId - The environment ID
 * @returns A DBCreateIntegration object ready to be passed to createProviderConfig
 */
export async function buildIntegrationConfig(body: PostIntegration['Body'], environmentId: number): Promise<DBCreateIntegration> {
    // Determine unique_key
    let unique_key: string;
    if ('integrationId' in body && body.integrationId) {
        const exists = await configService.getIdByProviderConfigKey(environmentId, body.integrationId);
        unique_key = !exists ? body.integrationId : `${body.integrationId}-${nanoid(4).toLocaleLowerCase()}`;
    } else {
        const exists = await configService.getIdByProviderConfigKey(environmentId, body.provider);
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

    const { auth } = body;

    // Handle credentials based on authType
    if (auth && 'authType' in auth) {
        if (auth.authType === 'OAUTH1' || auth.authType === 'OAUTH2' || auth.authType === 'TBA') {
            config.oauth_client_id = auth.clientId ?? null;
            config.oauth_client_secret = auth.clientSecret ?? null;
            config.oauth_scopes = auth.scopes ?? null;
        } else if (auth.authType === 'APP') {
            config.oauth_client_id = auth.appId ?? null;
            if (auth.privateKey) {
                // This is a legacy thing
                config.oauth_client_secret = Buffer.from(auth.privateKey).toString('base64');
            }
            config.app_link = auth.appLink ?? null;
        } else if (auth.authType === 'CUSTOM') {
            config.oauth_client_id = auth.clientId ?? null;
            config.oauth_client_secret = auth.clientSecret ?? null;
            config.app_link = auth.appLink ?? null;
            // This is a legacy thing
            config.custom = {
                ...config.custom,
                ...(auth.appId && { app_id: auth.appId }),
                ...(auth.privateKey && { private_key: Buffer.from(auth.privateKey).toString('base64') })
            };
        } else if (auth.authType === 'MCP_OAUTH2') {
            config.oauth_client_id = null;
            config.oauth_client_secret = null;
            config.oauth_scopes = auth.scopes ?? null;
        } else if (auth.authType === 'MCP_OAUTH2_GENERIC') {
            const { clientName, clientUri, clientLogoUri } = auth;
            config.custom = {
                ...config.custom,
                ...(clientName && { oauth_client_name: clientName }),
                ...(clientUri && { oauth_client_uri: clientUri }),
                ...(clientLogoUri && { oauth_client_logo_uri: clientLogoUri })
            };
        }
    }

    return config;
}
