/*
 * Copyright (c) 2022 Nango, all rights reserved.
 */

import {
    IntegrationTemplateOAuth2,
    IntegrationAuthModes,
    IntegrationTemplate as IntegrationTemplate,
    OAuth2Credentials,
    OAuthAuthorizationMethod,
    OAuthBodyFormat
} from './models.js';
import { AuthorizationCode } from 'simple-oauth2';
import connectionsManager from './services/connection.service.js';
import type { IntegrationConfig } from './models.js';

// Simple OAuth 2 does what it says on the tin: A simple, no-frills client for OAuth 2 that implements the 3 most common grant_types.
// Well maintained, I like :-)
export function getSimpleOAuth2ClientConfig(integrationConfig: IntegrationConfig, integrationTemplate: IntegrationTemplate) {
    const tokenUrl = new URL(integrationTemplate.token_url);
    const authorizeUrl = new URL(integrationTemplate.authorization_url);
    const headers = { 'User-Agent': 'Pizzly' };

    const authConfig = integrationTemplate as IntegrationTemplateOAuth2;

    const config = {
        client: {
            id: integrationConfig.oauth_client_id!,
            secret: integrationConfig.oauth_client_secret!
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
            scopeSeparator: integrationTemplate.scope_separator || ' '
        }
    };

    return config;
}

export async function refreshOAuth2Credentials(
    credentials: OAuth2Credentials,
    integrationConfig: IntegrationConfig,
    integrationTemplate: IntegrationTemplate
): Promise<OAuth2Credentials> {
    const client = new AuthorizationCode(getSimpleOAuth2ClientConfig(integrationConfig, integrationTemplate));
    const oldAccessToken = client.createToken({
        access_token: credentials.accessToken,
        expires_at: credentials.expiresAt,
        refresh_token: credentials.refreshToken
    });

    let additionalParams = {};
    if (integrationTemplate.token_params) {
        additionalParams = integrationTemplate.token_params;
    }

    try {
        const rawNewAccessToken = await oldAccessToken.refresh(additionalParams);
        const newPizzlyCredentials = connectionsManager.parseRawCredentials(rawNewAccessToken.token, IntegrationAuthModes.OAuth2) as OAuth2Credentials;

        return newPizzlyCredentials;
    } catch (e) {
        throw new Error(`There was a problem refreshing the OAuth 2 credentials, operation failed: ${(e as Error).message}`);
    }
}
