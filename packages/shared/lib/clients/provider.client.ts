import braintree from 'braintree';
import qs from 'qs';

import { axiosInstance as axios, getLogger, stringifyError } from '@nangohq/utils';

import { NangoError } from '../utils/error.js';
import { isTokenExpired, makeUrl, parseTokenExpirationDate } from '../utils/utils.js';

import type { Config as ProviderConfig } from '../models/index.js';
import type {
    AuthorizationTokenResponse,
    ConnectionConfig,
    DBConnectionDecrypted,
    OAuth2Credentials,
    ProviderOAuth2,
    RefreshTokenResponse
} from '@nangohq/types';

const stripeAppExpiresIn = 3600;
const corosExpiresIn = 2592000;
const workdayOauthExpiresIn = 3600;
const bullhornExpiresInMinutes = 10080;
const bullhornLoginUrl = 'https://rest-west.bullhornstaffing.com/rest-services/login';
const jobberExpiresIn = 3600;
const instagramExpiresIn = 3600;
const instagramLongLivedTokenUrl = 'https://graph.instagram.com/access_token';

const logger = getLogger('Provider.Client');

class ProviderClient {
    public shouldUseProviderClient(provider: string): boolean {
        switch (provider) {
            case 'braintree':
            case 'braintree-sandbox':
            case 'bullhorn':
            case 'coros':
            case 'coros-sandbox':
            case 'figma':
            case 'figjam':
            case 'facebook':
            case 'instagram':
            case 'jobber':
            case 'microsoft-admin':
            case 'microsoft-teams-bot':
            case 'one-drive':
            case 'sharepoint-online':
            case 'tiktok-ads':
            case 'tiktok-accounts':
            case 'tiktok-personal':
            case 'sentry-oauth':
            case 'stripe-app':
            case 'stripe-app-sandbox':
            case 'workday-oauth':
            case 'fanvue':
            case 'mercury':
                return true;
            default:
                return false;
        }
    }

    public shouldIntrospectToken(provider: string): boolean {
        switch (provider) {
            case 'salesforce':
            case 'salesforce-sandbox':
            case 'salesforce-experience-cloud':
            case 'salesforce-jwt':
                return true;
            default:
                return false;
        }
    }

    public async getToken(config: ProviderConfig, tokenUrl: string, code: string, callBackUrl: string, codeVerifier: string): Promise<object> {
        switch (config.provider) {
            case 'braintree':
            case 'braintree-sandbox':
                return this.createBraintreeToken(code, config.oauth_client_id, config.oauth_client_secret);
            case 'bullhorn':
                return this.createBullhornSession(tokenUrl, code, config.oauth_client_id, config.oauth_client_secret, callBackUrl);
            case 'coros':
            case 'coros-sandbox':
                return this.createCorosToken(tokenUrl, code, config.oauth_client_id, config.oauth_client_secret, callBackUrl);
            case 'figma':
            case 'figjam':
                return this.createFigmaToken(tokenUrl, code, config.oauth_client_id, config.oauth_client_secret, callBackUrl);
            case 'jobber':
                return this.createJobberToken(tokenUrl, code, config.oauth_client_id, config.oauth_client_secret);
            case 'facebook':
                return this.createFacebookToken(tokenUrl, code, config.oauth_client_id, config.oauth_client_secret, callBackUrl, codeVerifier);
            case 'instagram':
                return this.createInstagramToken(tokenUrl, code, config.oauth_client_id, config.oauth_client_secret, callBackUrl);
            case 'tiktok-ads':
                return this.createTiktokAdsToken(tokenUrl, code, config.oauth_client_id, config.oauth_client_secret);
            case 'one-drive':
            case 'sharepoint-online':
                return this.createSharepointToken(tokenUrl, code, config.oauth_client_id, config.oauth_client_secret, callBackUrl);
            case 'microsoft-teams-bot':
                return this.createMicrosoftTeamsBotToken(tokenUrl, code, config.oauth_client_id, config.oauth_client_secret, callBackUrl);
            case 'microsoft-admin':
                return this.createMicrosoftAdminToken(tokenUrl, config.oauth_client_id, config.oauth_client_secret, config.oauth_scopes);
            case 'sentry-oauth':
                return this.createSentryOauthToken(tokenUrl, code, config.oauth_client_id, config.oauth_client_secret);
            case 'stripe-app':
            case 'stripe-app-sandbox':
                return this.createStripeAppToken(tokenUrl, code, config.oauth_client_secret, callBackUrl);
            case 'tiktok-accounts':
                return this.createTiktokAccountsToken(tokenUrl, code, config.oauth_client_id, config.oauth_client_secret, callBackUrl);
            case 'tiktok-personal':
                return this.createTiktokPersonalToken(tokenUrl, code, config.oauth_client_id, config.oauth_client_secret, callBackUrl);
            case 'workday-oauth':
                return this.createWorkdayOauthAccessToken(tokenUrl, code, config.oauth_client_id, config.oauth_client_secret, callBackUrl, codeVerifier);
            case 'fanvue':
                return this.createFanvueToken(tokenUrl, code, config.oauth_client_id, config.oauth_client_secret, callBackUrl, codeVerifier);
            case 'mercury':
                return this.createMercuryToken(tokenUrl, code, callBackUrl, codeVerifier);
            default:
                throw new NangoError('unknown_provider_client');
        }
    }

    public async refreshToken(provider: ProviderOAuth2, config: ProviderConfig, connection: DBConnectionDecrypted): Promise<object> {
        if (connection.credentials.type !== 'OAUTH2') {
            throw new NangoError('wrong_credentials_type');
        }

        const credentials = connection.credentials;
        const interpolatedTokenUrl = makeUrl(provider.token_url as string, connection.connection_config);

        if (config.provider !== 'facebook' && !credentials.refresh_token && config.provider !== 'microsoft-admin' && config.provider !== 'instagram') {
            throw new NangoError('missing_refresh_token');
        } else if ((config.provider === 'facebook' || config.provider === 'instagram') && !credentials.access_token) {
            throw new NangoError('missing_facebook_access_token');
        }

        switch (config.provider) {
            case 'bullhorn':
                return this.refreshBullhornSession(
                    provider.token_url as string,
                    credentials.refresh_token!,
                    config.oauth_client_id,
                    config.oauth_client_secret
                );
            case 'braintree':
            case 'braintree-sandbox':
                return this.refreshBraintreeToken(credentials.refresh_token!, config.oauth_client_id, config.oauth_client_secret);
            case 'coros':
            case 'coros-sandbox':
                return this.refreshCorosToken(
                    provider.refresh_url as string,
                    credentials.access_token,
                    credentials.refresh_token!,
                    config.oauth_client_id,
                    config.oauth_client_secret
                );
            case 'figma':
            case 'figjam':
                return this.refreshFigmaToken(provider.refresh_url as string, credentials.refresh_token!, config.oauth_client_id, config.oauth_client_secret);
            case 'jobber':
                return this.refreshJobberToken(provider.token_url as string, credentials.refresh_token!, config.oauth_client_id, config.oauth_client_secret);
            case 'facebook':
                return this.refreshFacebookToken(provider.token_url as string, credentials.access_token, config.oauth_client_id, config.oauth_client_secret);
            case 'instagram':
                return this.refreshInstagramToken(provider.refresh_url as string, credentials.access_token);
            case 'one-drive':
            case 'sharepoint-online':
                return this.refreshSharepointToken(
                    provider.token_url as string,
                    credentials.refresh_token!,
                    config.oauth_client_id,
                    config.oauth_client_secret,
                    connection.connection_config
                );
            case 'microsoft-teams-bot':
                return this.refreshMicrosoftTeamsBotToken(interpolatedTokenUrl.href, config.oauth_client_id, config.oauth_client_secret, connection);
            case 'microsoft-admin':
                return this.refreshMicrosoftAdminToken(interpolatedTokenUrl.href, config.oauth_client_id, config.oauth_client_secret, config.oauth_scopes);
            case 'tiktok-accounts':
                return this.refreshTiktokAccountsToken(
                    provider.refresh_url as string,
                    credentials.refresh_token as string,
                    config.oauth_client_id,
                    config.oauth_client_secret
                );
            case 'tiktok-personal':
                return this.refreshTiktokPersonalToken(
                    provider.token_url as string,
                    credentials.refresh_token as string,
                    config.oauth_client_id,
                    config.oauth_client_secret
                );
            case 'sentry-oauth':
                return this.refreshSentryOauthToken(
                    interpolatedTokenUrl.href,
                    credentials.refresh_token as string,
                    config.oauth_client_id,
                    config.oauth_client_secret
                );
            case 'stripe-app':
            case 'stripe-app-sandbox':
                return this.refreshStripeAppToken(provider.token_url as string, credentials.refresh_token!, config.oauth_client_secret);
            case 'workday-oauth':
                return this.refreshWorkdayAccessToken(
                    interpolatedTokenUrl.href,
                    credentials.refresh_token!,
                    config.oauth_client_id,
                    config.oauth_client_secret,
                    connection.connection_config
                );
            case 'fanvue':
                return this.refreshFanvueToken(interpolatedTokenUrl.href, credentials.refresh_token!, config.oauth_client_id, config.oauth_client_secret);
            case 'mercury':
                return this.refreshMercuryToken(interpolatedTokenUrl.href, credentials.refresh_token!);
            default:
                throw new NangoError('unknown_provider_client');
        }
    }

    public async introspectedTokenExpired(config: ProviderConfig, connection: DBConnectionDecrypted): Promise<boolean> {
        const { credentials } = connection;
        const isOAuth2 = credentials.type === 'OAUTH2';
        const isTwoStep = credentials.type === 'TWO_STEP';

        if (!isOAuth2 && !isTwoStep) {
            throw new NangoError('wrong_credentials_type');
        }

        const accessToken = isOAuth2 ? credentials.access_token : credentials.token;
        if (!accessToken) {
            throw new NangoError('access_token_missing');
        }

        const connectionConfig = connection.connection_config as Record<string, string>;
        const clientId = isTwoStep ? credentials['clientId'] : config.oauth_client_id;
        const clientSecret = isTwoStep ? credentials['clientSecret'] : config.oauth_client_secret;

        if (!clientId || !clientSecret) {
            throw new NangoError('client_credentials_missing');
        }

        switch (config.provider) {
            case 'salesforce':
            case 'salesforce-sandbox':
            case 'salesforce-experience-cloud':
            case 'salesforce-jwt':
                return this.introspectedSalesforceTokenExpired(accessToken, clientId, clientSecret, connectionConfig);
            default:
                throw new NangoError('unknown_provider_client');
        }
    }

    private async createFigmaToken(
        tokenUrl: string,
        code: string,
        clientId: string,
        clientSecret: string,
        callBackUrl: string
    ): Promise<AuthorizationTokenResponse> {
        const params = new URLSearchParams();
        params.set('redirect_uri', callBackUrl);
        const body = {
            client_id: clientId,
            client_secret: clientSecret,
            code: code,
            grant_type: 'authorization_code'
        };
        const url = `${tokenUrl}?${params.toString()}`;
        const response = await axios.post(url, body);
        if (response.status === 200 && response.data !== null) {
            return {
                access_token: response.data['access_token'],
                refresh_token: response.data['refresh_token'],
                expires_in: response.data['expires_in']
            };
        }
        throw new NangoError('figma_token_request_error');
    }

    private async createFacebookToken(
        tokenUrl: string,
        code: string,
        clientId: string,
        clientSecret: string,
        callBackUrl: string,
        codeVerifier: string
    ): Promise<AuthorizationTokenResponse> {
        const params = new URLSearchParams();
        params.set('redirect_uri', callBackUrl);
        const body = {
            client_id: clientId,
            client_secret: clientSecret,
            code: code,
            redirect_uri: callBackUrl,
            code_verifier: codeVerifier
        };
        const url = `${tokenUrl}?${params.toString()}`;
        const response = await axios.post(url, body);
        if (response.status === 200 && response.data !== null) {
            return {
                access_token: response.data['access_token'],
                expires_in: response.data['expires_in']
            };
        }
        throw new NangoError('facebook_token_request_error');
    }

    private async createTiktokAdsToken(tokenUrl: string, code: string, clientId: string, clientSecret: string): Promise<object> {
        try {
            const body = {
                secret: clientSecret,
                app_id: clientId,
                auth_code: code
            };

            const response = await axios.post(tokenUrl, body);

            if (response.status === 200 && response.data !== null) {
                return {
                    access_token: response.data.data['access_token'],
                    advertiser_ids: response.data.data['advertiser_ids'],
                    scope: response.data.data['scope'],
                    request_id: response.data['request_id']
                };
            }
            throw new NangoError('tiktok_token_request_error');
        } catch (err: any) {
            throw new NangoError('tiktok_token_request_error', err.message);
        }
    }

    private async createSentryOauthToken(tokenUrl: string, code: string, client_id: string, client_secret: string): Promise<object> {
        try {
            const body = {
                client_id,
                client_secret,
                grant_type: 'authorization_code',
                code
            };

            const response = await axios.post(tokenUrl, body);

            if (response.status === 201 && response.data) {
                const { token, refreshToken, expiresAt, ...rest } = response.data;

                return {
                    ...rest,
                    expires_at: expiresAt,
                    access_token: token,
                    refresh_token: refreshToken
                };
            }

            throw new NangoError('sentry_oauth_token_request_error', response.data);
        } catch (err: any) {
            throw new NangoError('sentry_oauth_token_request_error', err);
        }
    }

    private async createBullhornSession(tokenUrl: string, code: string, client_id: string, client_secret: string, redirect_uri: string): Promise<object> {
        const tokenParams = {
            client_id,
            client_secret,
            grant_type: 'authorization_code',
            code,
            redirect_uri
        };

        try {
            const response = await axios.post(tokenUrl, null, { params: tokenParams });
            if (response.status === 200 && response.data?.access_token && response.data?.refresh_token) {
                const { access_token, refresh_token } = response.data;

                const sessionParams = {
                    version: '*',
                    access_token,
                    ttl: bullhornExpiresInMinutes
                };

                const sessionResponse = await axios.post(bullhornLoginUrl, null, { params: sessionParams });

                if (sessionResponse.status !== 200 || !sessionResponse.data?.restUrl || !sessionResponse.data?.BhRestToken) {
                    throw new NangoError('bullhorn_session_creation_failed', { cause: sessionResponse.data });
                }

                const { restUrl, BhRestToken } = sessionResponse.data;

                return {
                    restUrl,
                    expires_in: bullhornExpiresInMinutes * 60,
                    access_token: BhRestToken,
                    refresh_token
                };
            }

            throw new NangoError('bullhorn_session_request_error', { cause: response.data });
        } catch (err: any) {
            throw new NangoError('bullhorn_session_request_error', { cause: err });
        }
    }

    private async refreshBullhornSession(tokenUrl: string, refresh_token: string, client_id: string, client_secret: string): Promise<object> {
        try {
            const tokenParams = {
                client_id,
                client_secret,
                grant_type: 'refresh_token',
                refresh_token
            };

            const response = await axios.post(tokenUrl, null, { params: tokenParams });

            if (response.status === 200 && response.data?.access_token && response.data?.refresh_token) {
                const { access_token, refresh_token } = response.data;

                const sessionParams = {
                    version: '*',
                    access_token,
                    ttl: bullhornExpiresInMinutes
                };

                const sessionResponse = await axios.post(bullhornLoginUrl, null, { params: sessionParams });

                if (sessionResponse.status !== 200 || !sessionResponse.data?.restUrl || !sessionResponse.data?.BhRestToken) {
                    throw new NangoError('bullhorn_session_refresh_failed', { cause: sessionResponse.data });
                }

                const { BhRestToken, restUrl } = sessionResponse.data;

                return {
                    restUrl,
                    expires_in: bullhornExpiresInMinutes * 60,
                    access_token: BhRestToken,
                    refresh_token
                };
            }

            throw new NangoError('bullhorn_session_refresh_error', { cause: response.data });
        } catch (err: any) {
            throw new NangoError('bullhorn_session_refresh_error', { cause: err });
        }
    }

    private async createJobberToken(tokenUrl: string, code: string, client_id: string, client_secret: string): Promise<object> {
        try {
            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded'
            };
            const body = {
                client_id,
                client_secret,
                grant_type: 'authorization_code',
                code
            };

            const response = await axios.post(tokenUrl, body, { headers: headers });

            if (response.status === 200 && response.data) {
                return {
                    ...response.data,
                    expires_in: jobberExpiresIn
                };
            }

            throw new NangoError('jobber_token_request_error', response.data);
        } catch (err: any) {
            throw new NangoError('jobber_token_request_error', err);
        }
    }

    private async refreshJobberToken(refreshTokenUrl: string, refresh_token: string, client_id: string, client_secret: string): Promise<object> {
        try {
            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded'
            };

            const body = {
                client_id,
                client_secret,
                grant_type: 'refresh_token',
                refresh_token
            };

            const response = await axios.post(refreshTokenUrl, body, { headers: headers });

            if (response.status === 200 && response.data) {
                return {
                    ...response.data,
                    expires_in: jobberExpiresIn
                };
            }

            throw new NangoError('jobber_refresh_token_request_error', response.data);
        } catch (err: any) {
            throw new NangoError('jobber_refresh_token_request_error', err);
        }
    }

    private async refreshSentryOauthToken(refreshTokenUrl: string, refresh_token: string, client_id: string, client_secret: string): Promise<object> {
        try {
            const body = {
                client_id,
                client_secret,
                grant_type: 'refresh_token',
                refresh_token
            };

            const response = await axios.post(refreshTokenUrl, body);

            if (response.status === 201 && response.data) {
                const { token, refreshToken, expiresAt, ...rest } = response.data;

                return {
                    ...rest,
                    expires_at: expiresAt,
                    access_token: token,
                    refresh_token: refreshToken
                };
            }

            throw new NangoError('sentry_oauth_refresh_token_request_error', response.data);
        } catch (err: any) {
            throw new NangoError('sentry_oauth_refresh_token_request_error', err);
        }
    }

    private async createStripeAppToken(tokenUrl: string, code: string, clientSecret: string, callback: string): Promise<object> {
        try {
            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: 'Basic ' + Buffer.from(clientSecret + ':').toString('base64')
            };
            const body = {
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: callback
            };

            const response = await axios.post(tokenUrl, body, { headers: headers });
            if (response.status === 200 && response.data) {
                return {
                    access_token: response.data['access_token'],
                    livemode: response.data['livemode'],
                    refresh_token: response.data['refresh_token'],
                    scope: response.data['scope'],
                    stripe_publishable_key: response.data['stripe_publishable_key'],
                    stripe_user_id: response.data['stripe_user_id'],
                    token_type: response.data['token_type'],
                    expires_in: stripeAppExpiresIn
                };
            }

            throw new NangoError('stripe_app_token_request_error');
        } catch (err: any) {
            throw new NangoError('stripe_app_token_request_error', stringifyError(err));
        }
    }

    private async refreshStripeAppToken(refreshTokenUrl: string, refreshToken: string, clientSecret: string): Promise<object> {
        try {
            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: 'Basic ' + Buffer.from(clientSecret + ':').toString('base64')
            };

            const body = {
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            };

            const response = await axios.post(refreshTokenUrl, body, { headers: headers });

            if (response.status === 200 && response.data) {
                return {
                    access_token: response.data['access_token'],
                    livemode: response.data['livemode'],
                    refresh_token: response.data['refresh_token'],
                    scope: response.data['scope'],
                    stripe_publishable_key: response.data['stripe_publishable_key'],
                    stripe_user_id: response.data['stripe_user_id'],
                    token_type: response.data['token_type'],
                    expires_in: stripeAppExpiresIn
                };
            }
            throw new NangoError('stripe_app_token_refresh_request_error');
        } catch (err: any) {
            throw new NangoError('stripe_app_token_refresh_request_error', stringifyError(err));
        }
    }

    private async createTiktokAccountsToken(tokenUrl: string, code: string, client_id: string, client_secret: string, redirect_uri: string): Promise<object> {
        try {
            const body = {
                client_id,
                client_secret,
                grant_type: 'authorization_code',
                auth_code: code,
                redirect_uri
            };

            const response = await axios.post(tokenUrl, body);

            if (response.status === 200 && response.data && response.data.data) {
                return {
                    access_token: response.data.data['access_token'],
                    token_type: response.data.data['token_type'],
                    scope: response.data.data['scope'],
                    expires_in: response.data.data['expires_in'],
                    refresh_token: response.data.data['refresh_token'],
                    refresh_token_expires_in: response.data.data['refresh_token_expires_in'],
                    open_id: response.data.data['open_id'],
                    request_id: response.data['request_id']
                };
            }

            throw new NangoError('tiktok_token_request_error', response.data);
        } catch (err: any) {
            throw new NangoError('tiktok_token_request_error', err.message);
        }
    }

    private async refreshTiktokAccountsToken(refreshTokenUrl: string, refreshToken: string, clientId: string, clientSecret: string): Promise<object> {
        try {
            const body = {
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            };

            const response = await axios.post(refreshTokenUrl, body);

            if (response.status === 200 && response.data && response.data.data) {
                return {
                    access_token: response.data.data['access_token'],
                    token_type: response.data.data['token_type'],
                    scope: response.data.data['scope'],
                    expires_in: response.data.data['expires_in'],
                    refresh_token: response.data.data['refresh_token'],
                    refresh_token_expires_in: response.data.data['refresh_token_expires_in'],
                    open_id: response.data.data['open_id'],
                    request_id: response.data['request_id']
                };
            }
            throw new NangoError('tiktok_token_refresh_request_error');
        } catch (err: any) {
            throw new NangoError('tiktok_token_refresh_request_error', err.message);
        }
    }

    private async createTiktokPersonalToken(tokenUrl: string, code: string, clientKey: string, clientSecret: string, redirectUri: string): Promise<object> {
        try {
            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded'
            };

            const body = {
                client_key: clientKey,
                client_secret: clientSecret,
                code,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri
            };

            const response = await axios.post(tokenUrl, body, { headers });

            if (response.status === 200 && response.data) {
                return {
                    ...response.data
                };
            }

            throw new NangoError('tiktok_personal_token_request_error', response.data);
        } catch (err: any) {
            throw new NangoError('tiktok_personal_token_request_error', err.message);
        }
    }

    private async refreshTiktokPersonalToken(tokenUrl: string, refreshToken: string, clientKey: string, clientSecret: string): Promise<object> {
        try {
            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded'
            };

            const body = {
                client_key: clientKey,
                client_secret: clientSecret,
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            };

            const response = await axios.post(tokenUrl, body, { headers });

            if (response.status === 200 && response.data) {
                return {
                    ...response.data
                };
            }

            throw new NangoError('tiktok_personal_refresh_token_request_error', response.data);
        } catch (err: any) {
            throw new NangoError('tiktok_personal_refresh_token_request_error', err.message);
        }
    }

    private async refreshFigmaToken(refreshTokenUrl: string, refreshToken: string, clientId: string, clientSecret: string): Promise<RefreshTokenResponse> {
        const body = {
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken
        };
        const response = await axios.post(refreshTokenUrl, body);
        if (response.status === 200 && response.data !== null) {
            return {
                refresh_token: refreshToken,
                access_token: response.data['access_token'],
                expires_in: response.data['expires_in']
            };
        }
        throw new NangoError('figma_refresh_token_request_error');
    }

    private async refreshFacebookToken(refreshTokenUrl: string, accessToken: string, clientId: string, clientSecret: string): Promise<RefreshTokenResponse> {
        const queryParams = {
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'fb_exchange_token',
            fb_exchange_token: accessToken
        };
        const urlWithParams = `${refreshTokenUrl}?${qs.stringify(queryParams)}`;
        const response = await axios.post(urlWithParams);
        if (response.status === 200 && response.data !== null) {
            return {
                access_token: response.data['access_token'],
                expires_in: response.data['expires_in']
            };
        }
        throw new NangoError('facebook_refresh_token_request_error');
    }

    private async createInstagramToken(
        tokenUrl: string,
        code: string,
        clientId: string,
        clientSecret: string,
        redirectUri: string
    ): Promise<AuthorizationTokenResponse> {
        try {
            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded'
            };

            const body = {
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri,
                code
            };

            const response = await axios.post(tokenUrl, body, { headers });

            if (response.status === 200 && response.data) {
                // Exchange short-lived (24hr) token for long-lived (60 days) token
                const exchangeQueryParams = {
                    grant_type: 'ig_exchange_token',
                    access_token: response.data['access_token'],
                    client_secret: clientSecret
                };
                const exchangeUrl = `${instagramLongLivedTokenUrl}?${qs.stringify(exchangeQueryParams)}`;

                const exchangeResponse = await axios.get(exchangeUrl);

                if (exchangeResponse.status === 200 && exchangeResponse.data) {
                    return {
                        ...exchangeResponse.data
                    };
                }

                return {
                    ...response.data,
                    expires_in: instagramExpiresIn
                };
            }

            throw new NangoError('instagram_token_request_error');
        } catch (err: any) {
            throw new NangoError('instagram_token_request_error', stringifyError(err));
        }
    }

    private async refreshInstagramToken(refreshTokenUrl: string, accessToken: string): Promise<RefreshTokenResponse> {
        try {
            const queryParams = {
                grant_type: 'ig_refresh_token',
                access_token: accessToken
            };

            const urlWithParams = `${refreshTokenUrl}?${qs.stringify(queryParams)}`;
            const response = await axios.get(urlWithParams);

            if (response.status === 200 && response.data) {
                return {
                    ...response.data
                };
            }

            throw new NangoError('instagram_refresh_token_request_error', response.data);
        } catch (err: any) {
            throw new NangoError('instagram_refresh_token_request_error', stringifyError(err));
        }
    }

    private async createBraintreeToken(code: string, clientId: string, clientSecret: string): Promise<object> {
        const gateway = new braintree.BraintreeGateway({ clientId: clientId, clientSecret: clientSecret });
        const res = await gateway.oauth.createTokenFromCode({ code: code });

        if (!('credentials' in res && 'accessToken' in res.credentials && 'refreshToken' in res.credentials && 'expiresAt' in res.credentials)) {
            throw new NangoError('braintree_token_request_error');
        }

        const creds = res['credentials'];

        return {
            access_token: creds['accessToken'],
            refresh_token: creds['refreshToken'],
            expires_at: creds['expiresAt']
        };
    }

    private async createCorosToken(tokenUrl: string, code: string, clientId: string, clientSecret: string, callback: string): Promise<object> {
        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded'
        };
        const body = {
            client_id: clientId,
            redirect_uri: callback,
            code: code,
            client_secret: clientSecret,
            grant_type: 'authorization_code'
        };
        try {
            const response = await axios.post(tokenUrl, body, { headers: headers });
            if (response.status === 200 && response.data !== null && response.data['access_token']) {
                return {
                    access_token: response.data['access_token'],
                    refresh_token: response.data['refresh_token'],
                    expires_in: response.data['expires_in'],
                    openId: response.data['openId']
                };
            }
            const payload = {
                external_result: response.data.result,
                external_message: response.data.message
            };
            // Sample failure response: { "result": "5002", "message": "Unauthorized client ID" }
            throw new NangoError('request_token_external_error', payload);
        } catch (err: any) {
            throw new NangoError('request_token_external_error', err.message);
        }
    }

    private async refreshCorosToken(
        refreshTokenUrl: string,
        accessToken: string,
        refreshToken: string,
        clientId: string,
        clientSecret: string
    ): Promise<object> {
        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded'
        };

        const body = {
            client_id: clientId,
            refresh_token: refreshToken,
            client_secret: clientSecret,
            grant_type: 'refresh_token'
        };
        try {
            const response = await axios.post(refreshTokenUrl, body, { headers: headers });
            if (response.status === 200 && response.data !== null && response.data.result === '0000') {
                // Sample success response: { "result": "0000", "message": "OK" }
                return {
                    access_token: accessToken,
                    refresh_token: refreshToken,
                    expires_in: corosExpiresIn
                };
            }
            const payload = {
                external_result: response.data.result,
                external_message: response.data.message
            };
            // Sample failure response: { "result": "1001", "message": "Service exceptions" }
            throw new NangoError('refresh_token_external_error', payload);
        } catch (err) {
            throw new NangoError('refresh_token_external_error', { message: err instanceof Error ? err.message : 'unknown error' });
        }
    }

    private async refreshBraintreeToken(refreshToken: string, clientId: string, clientSecret: string): Promise<object> {
        const gateway = new braintree.BraintreeGateway({ clientId: clientId, clientSecret: clientSecret });
        const res = await gateway.oauth.createTokenFromRefreshToken({ refreshToken: refreshToken });

        if (!('credentials' in res && 'accessToken' in res.credentials && 'refreshToken' in res.credentials && 'expiresAt' in res.credentials)) {
            throw new NangoError('braintree_token_refresh_error');
        }

        const creds = res['credentials'];

        return {
            access_token: creds['accessToken'],
            refresh_token: creds['refreshToken'],
            expires_at: creds['expiresAt']
        };
    }

    private async createWorkdayOauthAccessToken(
        tokenUrl: string,
        code: string,
        client_id: string,
        client_secret: string,
        redirect_uri: string,
        code_verifier: string
    ): Promise<object> {
        try {
            const body = {
                grant_type: 'authorization_code',
                code,
                redirect_uri,
                code_verifier
            };

            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: 'Basic ' + Buffer.from(client_id + ':' + client_secret).toString('base64')
            };

            const response = await axios.post(tokenUrl, body, { headers: headers });

            if (response.status === 200 && response.data) {
                return {
                    access_token: response.data['access_token'],
                    refresh_token: response.data['refresh_token'],
                    expires_in: workdayOauthExpiresIn
                };
            }

            throw new NangoError('request_token_external_error', response.data);
        } catch (err: any) {
            throw new NangoError('request_token_external_error', err.message);
        }
    }

    private async refreshWorkdayAccessToken(
        refreshTokenUrl: string,
        refreshToken: string,
        client_id: string,
        client_secret: string,
        connectionConfig: ConnectionConfig
    ): Promise<RefreshTokenResponse> {
        try {
            const body = {
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
            };
            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: 'Basic ' + Buffer.from(client_id + ':' + client_secret).toString('base64')
            };

            const response = await axios.post(refreshTokenUrl, body, { headers: headers });
            if (response.status === 200 && response.data) {
                const refreshTokenToUse = connectionConfig['overrideTokenRefresh'] ? refreshToken : response.data['refresh_token'];
                return {
                    refresh_token: refreshTokenToUse,
                    access_token: response.data['access_token'],
                    expires_in: workdayOauthExpiresIn
                };
            }
            throw new NangoError('refresh_token_external_error', response.data);
        } catch (err: any) {
            throw new NangoError('refresh_token_external_error', err.message);
        }
    }

    private async createFanvueToken(
        tokenUrl: string,
        code: string,
        client_id: string,
        client_secret: string,
        redirect_uri: string,
        code_verifier: string
    ): Promise<AuthorizationTokenResponse> {
        try {
            const body = {
                grant_type: 'authorization_code',
                code,
                redirect_uri,
                code_verifier
            };

            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: 'Basic ' + Buffer.from(client_id + ':' + client_secret).toString('base64')
            };

            const response = await axios.post(tokenUrl, body, { headers: headers });

            if (response.status === 200 && response.data) {
                return {
                    ...response.data
                };
            }

            throw new NangoError('fanvue_token_request_error');
        } catch (err: any) {
            throw new NangoError('fanvue_token_request_error', stringifyError(err));
        }
    }

    private async refreshFanvueToken(refreshTokenUrl: string, refreshToken: string, client_id: string, client_secret: string): Promise<RefreshTokenResponse> {
        try {
            const body = {
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            };
            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: 'Basic ' + Buffer.from(client_id + ':' + client_secret).toString('base64')
            };

            const response = await axios.post(refreshTokenUrl, body, { headers: headers });
            if (response.status === 200 && response.data) {
                return {
                    ...response.data
                };
            }
            throw new NangoError('fanvue_refresh_token_request_error');
        } catch (err: any) {
            throw new NangoError('fanvue_refresh_token_request_error', stringifyError(err));
        }
    }

    private async createMercuryToken(tokenUrl: string, code: string, redirect_uri: string, code_verifier: string): Promise<AuthorizationTokenResponse> {
        try {
            const body = new URLSearchParams({
                code,
                grant_type: 'authorization_code',
                redirect_uri,
                code_verifier
            });

            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded'
            };

            const response = await axios.post(tokenUrl, body.toString(), { headers });

            if (response.status === 200 && response.data) {
                return {
                    ...response.data
                };
            }

            throw new NangoError('mercury_token_request_error');
        } catch (err: any) {
            throw new NangoError('mercury_token_request_error', stringifyError(err));
        }
    }

    private async refreshMercuryToken(tokenUrl: string, refreshToken: string): Promise<RefreshTokenResponse> {
        try {
            const body = new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            });

            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded'
            };

            const response = await axios.post(tokenUrl, body.toString(), { headers });

            if (response.status === 200 && response.data) {
                return {
                    ...response.data
                };
            }
            throw new NangoError('mercury_refresh_token_request_error');
        } catch (err: any) {
            throw new NangoError('mercury_refresh_token_request_error', stringifyError(err));
        }
    }

    private async introspectedSalesforceTokenExpired(
        accessToken: string,
        clientId: string,
        clientSecret: string,
        connectionConfig: Record<string, string>
    ): Promise<boolean> {
        if (!connectionConfig['instance_url']) {
            throw new NangoError('salesforce_instance_url_missing');
        }

        const url = `${connectionConfig['instance_url']}/services/oauth2/introspect`;

        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept-Encoding': 'application/json'
        };

        const body = {
            token: accessToken,
            client_id: clientId,
            client_secret: clientSecret,
            token_type_hint: 'access_token'
        };

        try {
            const res = await axios.post(url, body, { headers: headers });

            if (res.status != 200 || res.data == null || !res.data['active'] || res.data['exp'] == null) {
                return true;
            }

            const expireDate = parseTokenExpirationDate(res.data['exp']);

            return isTokenExpired(expireDate, 15 * 60);
        } catch (err) {
            logger.error('introspectSalesforce', stringifyError(err));
            // TODO add observability
            return true;
        }
    }

    private async createSharepointToken(
        tokenUrl: string,
        code: string,
        clientId: string,
        clientSecret: string,
        redirectUri: string
    ): Promise<AuthorizationTokenResponse> {
        try {
            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded'
            };

            const body = {
                client_id: clientId,
                client_secret: clientSecret,
                code: code,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
            };

            const response = await axios.post(tokenUrl, body, { headers });

            if (response.status === 200 && response.data) {
                return {
                    ...response.data
                };
            }

            throw new NangoError('sharepoint_token_request_error', response.data);
        } catch (err: any) {
            throw new NangoError('sharepoint_token_request_error', err.message);
        }
    }

    private async createMicrosoftTeamsBotToken(
        tokenUrl: string,
        code: string,
        clientId: string,
        clientSecret: string,
        redirectUri: string
    ): Promise<AuthorizationTokenResponse> {
        try {
            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded'
            };

            const body = {
                client_id: clientId,
                client_secret: clientSecret,
                code: code,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
            };

            const response = await axios.post(tokenUrl, body, { headers });

            if (response.status === 200 && response.data) {
                return {
                    ...response.data
                };
            }

            throw new NangoError('microsoft_teams_bot_token_request_error', response.data);
        } catch (err: any) {
            console.log(err);
            throw new NangoError('microsoft_teams_bot_token_request_error', stringifyError(err));
        }
    }

    private async refreshSharepointToken(
        tokenUrl: string,
        refreshToken: string,
        clientId: string,
        clientSecret: string,
        connectionConfig: ConnectionConfig
    ): Promise<object> {
        try {
            let sharepointAccessToken: Record<string, string> | undefined = undefined;
            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded'
            };

            if (connectionConfig['sharepointAccessToken'] && connectionConfig['sharepointAccessToken']['refresh_token']) {
                const tenantId = connectionConfig['tenantId'];
                if (!tenantId) {
                    throw new NangoError('sharepoint_tenant_id_missing');
                }

                const sharepointTokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

                const sharepointBody = {
                    client_id: clientId,
                    client_secret: clientSecret,
                    refresh_token: connectionConfig['sharepointAccessToken']['refresh_token'],
                    grant_type: 'refresh_token',
                    scope: `https://${tenantId}.sharepoint.com/Sites.Read.All`
                };

                const sharepointResponse = await axios.post(sharepointTokenUrl, sharepointBody, { headers });

                if (sharepointResponse.status === 200 && sharepointResponse.data) {
                    const expires_at = Date.now() + sharepointResponse.data.expires_in * 1000;

                    sharepointAccessToken = {
                        ...sharepointResponse.data,
                        expires_at
                    };
                } else {
                    throw new NangoError('sharepoint_refresh_token_request_error', sharepointResponse.data);
                }
            }

            const body = {
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
            };

            const response = await axios.post(tokenUrl, body, { headers });

            if (response.status === 200 && response.data) {
                return {
                    ...response.data,
                    sharepointAccessToken
                };
            }

            throw new NangoError('sharepoint_refresh_token_request_error', response.data);
        } catch (err: any) {
            throw new NangoError('sharepoint_refresh_token_request_error', err.message);
        }
    }

    private async refreshMicrosoftTeamsBotToken(tokenUrl: string, clientId: string, clientSecret: string, connection: DBConnectionDecrypted): Promise<object> {
        try {
            const credentials = connection.credentials as OAuth2Credentials;
            const connectionConfig = connection.connection_config;
            const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

            const graphBody = {
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: credentials.refresh_token!,
                grant_type: 'refresh_token'
            };
            const graphResponse = await axios.post(tokenUrl, graphBody, { headers });
            if (graphResponse.status !== 200 || !graphResponse.data) {
                throw new NangoError('microsoft_teams_bot_refresh_token_request_error', graphResponse.data);
            }
            const graphToken = graphResponse.data as Record<string, unknown>;

            const botHostTenantId = connectionConfig['botHostTenantId'];
            if (!botHostTenantId) {
                return graphToken;
            }

            const botTokenUrl = `https://login.microsoftonline.com/${botHostTenantId}/oauth2/v2.0/token`;
            const botBody = new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'client_credentials',
                scope: 'https://api.botframework.com/.default'
            });
            const botResponse = await axios.post(botTokenUrl, botBody.toString(), { headers });
            if (botResponse.status !== 200 || !botResponse.data?.access_token) {
                throw new NangoError('microsoft_teams_bot_bot_token_request_error', botResponse.data);
            }
            const expiresIn = Number(botResponse.data.expires_in) || 3600;
            const botFrameworkAccessToken = {
                access_token: botResponse.data.access_token,
                expires_in: botResponse.data.expires_in,
                expires_at: Date.now() + expiresIn * 1000
            };
            return {
                ...graphToken,
                botFrameworkAccessToken
            };
        } catch (err: any) {
            throw new NangoError('microsoft_teams_bot_refresh_token_request_error', stringifyError(err));
        }
    }

    private async createMicrosoftAdminToken(
        tokenUrl: string,
        clientId: string,
        clientSecret: string,
        oauthScopes?: string
    ): Promise<AuthorizationTokenResponse> {
        try {
            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded'
            };

            const scope = String(oauthScopes).split(',').join(' ').trim();

            const body = {
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'client_credentials',
                scope: encodeURIComponent(scope)
            };

            const response = await axios.post(tokenUrl, body, { headers });

            if (response.status === 200 && response.data) {
                return {
                    ...response.data
                };
            }

            throw new NangoError('microsoft_admin_token_request_error', response.data);
        } catch (err: any) {
            throw new NangoError('microsoft_admin_token_request_error', err.message);
        }
    }

    private async refreshMicrosoftAdminToken(
        tokenUrl: string,
        clientId: string,
        clientSecret: string,
        oauthScopes?: string
    ): Promise<AuthorizationTokenResponse> {
        try {
            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded'
            };

            const scope = String(oauthScopes).split(',').join(' ').trim();

            const body = {
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'client_credentials',
                scope: encodeURIComponent(scope)
            };

            const response = await axios.post(tokenUrl, body, { headers });

            if (response.status === 200 && response.data) {
                return {
                    ...response.data
                };
            }

            throw new NangoError('microsoft_admin_token_refresh_request_error', response.data);
        } catch (err: any) {
            throw new NangoError('microsoft_admin_token_refresh_request_error', err.message);
        }
    }
}

export default new ProviderClient();
