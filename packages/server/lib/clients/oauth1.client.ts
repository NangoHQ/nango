import http from 'node:http';
import https from 'node:https';

import oAuth1 from 'oauth';

import { assertSafeOAuthUrl, getOAuthSafeHttpAgents } from '@nangohq/shared';

import type { IntegrationConfig, Provider, ProviderOAuth1 } from '@nangohq/types';

interface OAuth1RequestTokenResult {
    request_token: string;
    request_token_secret: string;
    parsed_query_string: any;
}

// Signature of node-oauth's private `_performSecureRequest`, which we wrap to validate each redirect hop.
type PerformSecureRequest = (
    oauthToken: string | null,
    oauthTokenSecret: string | null,
    method: string,
    url: string,
    extraParams: Record<string, any> | null,
    postBody: string | Buffer | null,
    postContentType: string | undefined,
    callback?: (err: unknown, data?: any, res?: any) => void
) => http.ClientRequest | undefined;

// The choice of OAuth 1.0a libraries for node is not exactly great:
// There are a half-dozen around but none of the is really maintained anymore (no surprise, OAuth 1.0 is officially deprecated)
// We still need to support it though because a few dozen important services are still using it, e.g. Twitter, Etsy, Sellsy, Trello
// node-oauth seems to be stable since years, offers plenty of config flexibility and is at least somewhat maintained. Best of the bunch IMO as of August 2022
// Unfortunately it is dated and still uses callbacks, this wrapper here makes it easier to use with a promise API

// For reference, this is a pretty good graphic on the OAuth 1.0a flow: https://oauth.net/core/1.0/#anchor9
export class OAuth1Client {
    private client: oAuth1.OAuth;
    private config: IntegrationConfig;
    private authConfig: ProviderOAuth1;
    private requestTokenUrl: string;
    private accessTokenUrl: string;

    constructor(config: IntegrationConfig, provider: Provider, callbackUrl: string) {
        this.config = config;

        this.authConfig = provider as ProviderOAuth1;
        const headers = { 'User-Agent': 'Nango' };

        this.requestTokenUrl = this.authConfig.request_url;
        this.accessTokenUrl = typeof this.authConfig.token_url === 'string' ? this.authConfig.token_url : (this.authConfig.token_url?.['OAUTH1'] as string);

        this.client = new oAuth1.OAuth(
            this.requestTokenUrl,
            this.accessTokenUrl,
            this.config.oauth_client_id!,
            this.config.oauth_client_secret!,
            '1.0',
            callbackUrl,
            this.authConfig.signature_method,
            undefined,
            headers
        );

        this.client.setClientOptions({
            requestTokenHttpMethod: this.authConfig.request_http_method || 'POST',
            accessTokenHttpMethod: this.authConfig.token_http_method || 'POST',
            // Keep following 301/302 redirects (some OAuth1 token endpoints legitimately redirect), but every
            // hop is validated against the OAuth egress policy via the `_performSecureRequest` wrapper below.
            followRedirects: true
        });

        // node-oauth builds its request with a bare `http`/`https` client and no agent, so it never runs the
        // OAuth egress DNS-pinning lookup. Override the client factory to inject the OAuth-safe agents, which
        // resolve + pin the connected IP and reject blocked addresses (rebinding-safe on the connect path).
        const { httpAgent, httpsAgent } = getOAuthSafeHttpAgents();
        const createSafeClient = (
            port: number,
            hostname: string,
            method: string,
            path: string,
            reqHeaders: http.OutgoingHttpHeaders,
            sslEnabled: boolean
        ): http.ClientRequest => {
            const httpModel = sslEnabled ? https : http;
            return httpModel.request({ host: hostname, port, path, method, headers: reqHeaders, agent: sslEnabled ? httpsAgent : httpAgent });
        };
        // @ts-expect-error `_createClient` is a private method of node-oauth that we override to pin egress.
        this.client._createClient = createSafeClient;

        // node-oauth follows redirects by re-invoking `_performSecureRequest` with the `Location` URL
        // (see oauth.js), so wrapping it lets us validate every hop — the initial request and each redirect
        // target — against the OAuth egress policy. A blocked hop is surfaced through node-oauth's error
        // callback (which rejects the wrapping promise) rather than thrown, since redirects are followed from
        // an async response handler where a synchronous throw would go uncaught.
        // @ts-expect-error `_performSecureRequest` is a private node-oauth method.
        const originalPerformSecureRequest = this.client._performSecureRequest.bind(this.client) as PerformSecureRequest;
        const performGuardedRequest: PerformSecureRequest = (oauthToken, oauthTokenSecret, method, url, extraParams, postBody, postContentType, callback) => {
            // Streaming (no-callback) requests aren't used by this client; delegate untouched.
            if (!callback) {
                return originalPerformSecureRequest(oauthToken, oauthTokenSecret, method, url, extraParams, postBody, postContentType, callback);
            }
            assertSafeOAuthUrl(url)
                .then(() => {
                    originalPerformSecureRequest(oauthToken, oauthTokenSecret, method, url, extraParams, postBody, postContentType, callback);
                })
                .catch((err: unknown) => {
                    callback(err);
                });
            return undefined;
        };
        // @ts-expect-error `_performSecureRequest` is a private node-oauth method we wrap to guard every hop.
        this.client._performSecureRequest = performGuardedRequest;
    }

    async getOAuthRequestToken(): Promise<OAuth1RequestTokenResult> {
        let additionalTokenParams = {};
        if (this.authConfig.request_params) {
            additionalTokenParams = this.authConfig.request_params;
        }

        await assertSafeOAuthUrl(this.requestTokenUrl);

        const promise = new Promise<OAuth1RequestTokenResult>((resolve, reject) => {
            this.client.getOAuthRequestToken(
                additionalTokenParams,
                (error: { statusCode: number; data?: any } | undefined, token: string, token_secret: string, parsed_query_string: string) => {
                    if (error) {
                        reject(error as unknown as Error);
                    } else {
                        resolve({
                            request_token: token,
                            request_token_secret: token_secret,
                            parsed_query_string: parsed_query_string
                        });
                    }
                }
            );
        });

        return promise;
    }

    async getOAuthAccessToken(oauth_token: string, oauth_token_secret: string, oauth_token_verifier: string): Promise<any> {
        let additionalTokenParams: Record<string, any> = {};
        if (this.authConfig.token_params) {
            additionalTokenParams = this.authConfig.token_params;
        }

        await assertSafeOAuthUrl(this.accessTokenUrl);

        const promise = new Promise<Record<string, any>>((resolve, reject) => {
            // This is lifted from https://github.com/ciaranj/node-oauth/blob/master/lib/oauth.js#L456
            // Unfortunately that main method does not expose extra params like the initial token request does ¯\_(ツ)_/¯

            additionalTokenParams['oauth_verifier'] = oauth_token_verifier;

            // @ts-expect-error we access private method
            this.client._performSecureRequest(
                oauth_token,
                oauth_token_secret,
                // @ts-expect-error we access private method
                this.client._clientOptions.accessTokenHttpMethod,
                // @ts-expect-error we access private method
                this.client._accessUrl,
                additionalTokenParams,
                null,
                undefined,
                function (error, data, _response) {
                    if (error) {
                        reject(error as unknown as Error);
                        return;
                    }

                    resolve(extractQueryParams(data));
                }
            );
        });

        return promise;
    }

    getAuthorizationURL(requestToken: OAuth1RequestTokenResult, oAuth1CallbackURL: string) {
        const scopes = this.config.oauth_scopes ? this.config.oauth_scopes.split(',').join(this.authConfig.scope_separator || ' ') : '';

        let additionalAuthParams: Record<string, any> = {};
        if (this.authConfig.authorization_params) {
            additionalAuthParams = this.authConfig.authorization_params;
        }
        additionalAuthParams['oauth_callback'] = oAuth1CallbackURL;

        const queryParams = {
            oauth_token: requestToken.request_token,
            scope: scopes,
            ...additionalAuthParams
        };

        const url = new URL(this.authConfig.authorization_url!);
        const params = new URLSearchParams(queryParams);
        return `${url.href}?${params.toString()}`;
    }
}

export function extractQueryParams(data: string | Buffer | undefined): Record<string, any> {
    return Object.fromEntries(new URLSearchParams(typeof data === 'string' ? data : data?.toString()));
}
