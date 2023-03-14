/*
 * Copyright (c) 2022 Nango, all rights reserved.
 */

import {
    ProviderTemplateOAuth2,
    ProviderAuthModes,
    ProviderTemplate as ProviderTemplate,
    OAuth2Credentials,
    OAuthAuthorizationMethod,
    OAuthBodyFormat,
    Connection
} from '../models.js';
import { AuthorizationCode } from 'simple-oauth2';
import connectionsManager from '../services/connection.service.js';
import type { ProviderConfig } from '../models.js';
import { interpolateString } from '../utils/utils.js';
import errorManager from '../utils/error.manager.js';

// Simple OAuth 2 does what it says on the tin: A simple, no-frills client for OAuth 2 that implements the 3 most common grant_types.
// Well maintained, I like :-)
export function getSimpleOAuth2ClientConfig(providerConfig: ProviderConfig, template: ProviderTemplate, connectionConfig: Record<string, string>) {
    const tokenUrl = new URL(interpolateString(template.token_url, connectionConfig));
    const authorizeUrl = new URL(interpolateString(template.authorization_url, connectionConfig));
    const headers = { 'User-Agent': 'Nango' };

    const authConfig = template as ProviderTemplateOAuth2;

    return {
        client: {
            id: providerConfig.oauth_client_id!,
            secret: providerConfig.oauth_client_secret!
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

export async function getFreshOAuth2Credentials(connection: Connection, config: ProviderConfig, template: ProviderTemplate): Promise<OAuth2Credentials> {
    let credentials = connection.credentials as OAuth2Credentials;
    const client = new AuthorizationCode(getSimpleOAuth2ClientConfig(config, template, connection.connection_config));
    const oldAccessToken = client.createToken({
        access_token: credentials.access_token,
        expires_at: credentials.expires_at,
        refresh_token: credentials.refresh_token
    });

    let additionalParams = {};
    if (template.token_params) {
        additionalParams = template.token_params;
    }

    try {
        const rawNewAccessToken = await oldAccessToken.refresh(additionalParams);
        const newCredentials = connectionsManager.parseRawCredentials(rawNewAccessToken.token, ProviderAuthModes.OAuth2) as OAuth2Credentials;

        if (!newCredentials.refresh_token && credentials.refresh_token != null) {
            newCredentials.refresh_token = credentials.refresh_token;
        }

        return newCredentials;
    } catch (e) {
        errorManager.report(e, { accountId: connection.account_id, metadata: { request: JSON.stringify(e) } });
        throw new Error(`There was a problem refreshing the OAuth 2 credentials, operation failed: ${(e as Error).message}`);
    }
}
