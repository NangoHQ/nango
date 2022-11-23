/*
 * Copyright (c) 2022 Nango, all rights reserved.
 */

import {
    PizzlyIntegrationAuthConfigOAuth1,
    PizzlyIntegrationAuthConfigOAuth2,
    PizzlyIntegrationAuthModes,
    PizzlyIntegrationConfig,
    PizzlyOAuth2Credentials,
    OAuthAuthorizationMethod,
    OAuthBodyFormat
} from './types.js';
import oAuth1 from 'oauth';
import { AuthorizationCode } from 'simple-oauth2';

type OAuth1RequestTokenResult = {
    request_token: string;
    request_token_secret: string;
    parsed_query_string: any;
};

// The choice of OAuth 1.0a libraries for node is not exactly great:
// There are a half-dozen around but none of the is really maintained anymore (no surprise, OAuth 1.0 is officially deprecated)
// We still need to support it though because a few dozen important services are still using it, e.g. Twitter, Etsy, Sellsy, Trello
// node-oauth seems to be stable since years, offers plenty of config flexibility and is at least somewhat maintained. Best of the bunch IMO as of August 2022
// Unfortunately it is dated and still uses callbacks, this wrapper here makes it easier to use with a promise API

// For reference, this is a pretty good graphic on the OAuth 1.0a flow: https://oauth.net/core/1.0/#anchor9
export class PizzlyOAuth1Client {
    private client: oAuth1.OAuth;
    private integrationConfig: PizzlyIntegrationConfig;
    private authConfig: PizzlyIntegrationAuthConfigOAuth1;

    constructor(integrationConfig: PizzlyIntegrationConfig, callbackUrl: string) {
        this.integrationConfig = integrationConfig;

        this.authConfig = integrationConfig.auth as PizzlyIntegrationAuthConfigOAuth1;
        const headers = { 'User-Agent': 'Pizzly' };

        this.client = new oAuth1.OAuth(
            this.authConfig.request_url,
            this.authConfig.token_url,
            this.integrationConfig.oauth_client_id!,
            this.integrationConfig.oauth_client_secret!,
            '1.0A',
            callbackUrl,
            this.authConfig.signature_method,
            undefined,
            headers
        );

        this.client.setClientOptions({
            requestTokenHttpMethod: this.authConfig.request_http_method || 'POST',
            accessTokenHttpMethod: this.authConfig.token_http_method || 'POST',
            followRedirects: true
        });
    }

    async getOAuthRequestToken(): Promise<OAuth1RequestTokenResult> {
        let additionalTokenParams = {};
        if (this.authConfig.request_params) {
            additionalTokenParams = this.authConfig.request_params;
        }

        const promise = new Promise<OAuth1RequestTokenResult>((resolve, reject) => {
            this.client.getOAuthRequestToken(additionalTokenParams, (error: any, token: any, token_secret: any, parsed_query_string: any) => {
                if (error) {
                    reject(error);
                } else {
                    resolve({
                        request_token: token,
                        request_token_secret: token_secret,
                        parsed_query_string: parsed_query_string
                    });
                }
            });
        });

        return promise;
    }

    async getOAuthAccessToken(oauth_token: string, oauth_token_secret: string, oauth_token_verifier: string): Promise<any> {
        let additionalTokenParams = {};
        if (this.authConfig.token_params) {
            additionalTokenParams = this.authConfig.token_params;
        }

        const promise = new Promise<any>((resolve, reject) => {
            // This is lifted from https://github.com/ciaranj/node-oauth/blob/master/lib/oauth.js#L456
            // Unfortunately that main method does not expose extra params like the initial token request does ¯\_(ツ)_/¯

            // @ts-ignore
            additionalTokenParams['oauth_verifier'] = oauth_token_verifier;

            // @ts-ignore
            this.client._performSecureRequest(
                oauth_token,
                oauth_token_secret,
                // @ts-ignore
                this.client._clientOptions.accessTokenHttpMethod,
                // @ts-ignore
                this.client._accessUrl,
                additionalTokenParams,
                null,
                undefined,
                // @ts-ignore
                function (error, data, response) {
                    if (error) reject(error);
                    else {
                        // @ts-ignore
                        var queryParams = new URLSearchParams(data);

                        var parsedFull = {};
                        for (var pair of queryParams) {
                            // @ts-ignore
                            parsedFull[pair[0]] = pair[1];
                        }

                        resolve(parsedFull);
                    }
                }
            );
        });

        return promise;
    }

    getAuthorizationURL(requestToken: OAuth1RequestTokenResult) {
        const scopeSeparator = this.authConfig.scope_separator ? this.authConfig.scope_separator : ' ';
        const scopes = Array.isArray(this.integrationConfig.oauth_scopes)
            ? this.integrationConfig.oauth_scopes.join(scopeSeparator)
            : this.integrationConfig.oauth_scopes!;

        let additionalAuthParams = {};
        if (this.authConfig.authorization_params) {
            additionalAuthParams = this.authConfig.authorization_params;
        }

        const queryParams = {
            oauth_token: requestToken.request_token,
            scope: scopes,
            ...additionalAuthParams
        };

        const url = new URL(this.authConfig.authorization_url);
        const params = new URLSearchParams(queryParams);
        return `${url}?${params.toString()}`;
    }
}

// Simple OAuth 2 does what it says on the tin: A simple, no-frills client for OAuth 2 that implements the 3 most common grant_types.
// Well maintained, I like :-)
export function getSimpleOAuth2ClientConfig(integrationConfig: PizzlyIntegrationConfig) {
    const tokenUrl = new URL(integrationConfig.auth.token_url);
    const authorizeUrl = new URL(integrationConfig.auth.authorization_url);
    const headers = { 'User-Agent': 'Pizzly' };

    const authConfig = integrationConfig.auth as PizzlyIntegrationAuthConfigOAuth2;

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
            scopeSeparator: integrationConfig.auth.scope_separator || ' '
        }
    };

    return config;
}

export async function refreshOAuth2Credentials(
    credentials: PizzlyOAuth2Credentials,
    integrationConfig: PizzlyIntegrationConfig
): Promise<PizzlyOAuth2Credentials> {
    const client = new AuthorizationCode(getSimpleOAuth2ClientConfig(integrationConfig));
    const oldAccessToken = client.createToken({
        access_token: credentials.accessToken,
        expires_at: credentials.expiresAt,
        refresh_token: credentials.refreshToken
    });

    let additionalParams = {};
    if (integrationConfig.auth.token_params) {
        additionalParams = integrationConfig.auth.token_params;
    }

    try {
        const rawNewAccessToken = await oldAccessToken.refresh(additionalParams);
        const newPizzlyCredentials = ConnectionsManager.getInstance().parseRawCredentials(
            rawNewAccessToken.token,
            PizzlyIntegrationAuthModes.OAuth2
        ) as PizzlyOAuth2Credentials;

        return newPizzlyCredentials;
    } catch (e) {
        throw new Error(`There was a problem refreshing the OAuth 2 credentials, operation failed: ${(e as Error).message}`);
    }
}
