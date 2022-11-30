/*
 * Copyright (c) 2022 Nango, all rights reserved.
 */

import {
    ProviderTemplateOAuth2,
    ProviderAuthModes,
    ProviderTemplate as ProviderTemplate,
    OAuth2Credentials,
    OAuthAuthorizationMethod,
    OAuthBodyFormat
} from '../models.js';
import { AuthorizationCode } from 'simple-oauth2';
import connectionsManager from '../services/connection.service.js';
import type { ProviderConfig } from '../models.js';

// Simple OAuth 2 does what it says on the tin: A simple, no-frills client for OAuth 2 that implements the 3 most common grant_types.
// Well maintained, I like :-)
export function getSimpleOAuth2ClientConfig(config: ProviderConfig, template: ProviderTemplate) {
    const tokenUrl = new URL(template.token_url);
    const authorizeUrl = new URL(template.authorization_url);
    const headers = { 'User-Agent': 'Pizzly' };

    const authConfig = template as ProviderTemplateOAuth2;

    return {
        client: {
            id: config.oauth_client_id!,
            secret: config.oauth_client_secret!
        },
        auth: {
            tokenHost: tokenUrl.origin,
            tokenPath: tokenUrl.pathname,
            authorizeHost: authorizeUrl.origin,
            authorizePath: authorizeUrl.pathname
        },
        http: { headers: headers },
        options: {
            authorizationMethod: authConfig.authorization_method || OAuthAuthorizationMethod.BODY,
            bodyFormat: authConfig.body_format || OAuthBodyFormat.FORM,
            scopeSeparator: template.scope_separator || ' '
        }
    };
}

export async function refreshOAuth2Credentials(credentials: OAuth2Credentials, config: ProviderConfig, template: ProviderTemplate): Promise<OAuth2Credentials> {
    const client = new AuthorizationCode(getSimpleOAuth2ClientConfig(config, template));
    const oldAccessToken = client.createToken({
        access_token: credentials.accessToken,
        expires_at: credentials.expiresAt,
        refresh_token: credentials.refreshToken
    });

    let additionalParams = {};
    if (template.token_params) {
        additionalParams = template.token_params;
    }

    try {
        const rawNewAccessToken = await oldAccessToken.refresh(additionalParams);
        const newPizzlyCredentials = connectionsManager.parseRawCredentials(rawNewAccessToken.token, ProviderAuthModes.OAuth2) as OAuth2Credentials;

        return newPizzlyCredentials;
    } catch (e) {
        throw new Error(`There was a problem refreshing the OAuth 2 credentials, operation failed: ${(e as Error).message}`);
    }
}
