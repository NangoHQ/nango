/*
 * Copyright (c) 2022 Nango, all rights reserved.
 */

import type { ProviderTemplateOAuth1, ProviderTemplate } from '../models.js';
import oAuth1 from 'oauth';
import type { ProviderConfig } from '../models.js';

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
    private config: ProviderConfig;
    private authConfig: ProviderTemplateOAuth1;

    constructor(config: ProviderConfig, template: ProviderTemplate, callbackUrl: string) {
        this.config = config;

        this.authConfig = template as ProviderTemplateOAuth1;
        const headers = { 'User-Agent': 'Pizzly' };

        this.client = new oAuth1.OAuth(
            this.authConfig.request_url,
            this.authConfig.token_url,
            this.config.oauth_client_id!,
            this.config.oauth_client_secret!,
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
        const scopes = this.config.oauth_scopes.split(',').join(this.authConfig.scope_separator || ' ');

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
