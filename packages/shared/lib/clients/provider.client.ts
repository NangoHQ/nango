import braintree from 'braintree';
import type { Config as ProviderConfig, Connection, AuthorizationTokenResponse, RefreshTokenResponse } from '../models/index.js';
import type { ProviderOAuth2 } from '@nangohq/types';
import qs from 'qs';
import { parseTokenExpirationDate, isTokenExpired } from '../utils/utils.js';
import { NangoError } from '../utils/error.js';
import { getLogger, axiosInstance as axios } from '@nangohq/utils';

const stripeAppExpiresIn = 3600;
const corosExpiresIn = 2592000;
const logger = getLogger('Provider.Client');

class ProviderClient {
    public shouldUseProviderClient(provider: string): boolean {
        switch (provider) {
            case 'braintree':
            case 'braintree-sandbox':
            case 'coros':
            case 'coros-sandbox':
            case 'figma':
            case 'figjam':
            case 'facebook':
            case 'tiktok-ads':
            case 'tiktok-accounts':
            case 'stripe-app':
            case 'stripe-app-sandbox':
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
            case 'coros':
            case 'coros-sandbox':
                return this.createCorosToken(tokenUrl, code, config.oauth_client_id, config.oauth_client_secret, callBackUrl);
            case 'figma':
            case 'figjam':
                return this.createFigmaToken(tokenUrl, code, config.oauth_client_id, config.oauth_client_secret, callBackUrl);
            case 'facebook':
                return this.createFacebookToken(tokenUrl, code, config.oauth_client_id, config.oauth_client_secret, callBackUrl, codeVerifier);
            case 'tiktok-ads':
                return this.createTiktokAdsToken(tokenUrl, code, config.oauth_client_id, config.oauth_client_secret);
            case 'stripe-app':
            case 'stripe-app-sandbox':
                return this.createStripeAppToken(tokenUrl, code, config.oauth_client_secret, callBackUrl);
            case 'tiktok-accounts':
                return this.createTiktokAccountsToken(tokenUrl, code, config.oauth_client_id, config.oauth_client_secret, callBackUrl);
            default:
                throw new NangoError('unknown_provider_client');
        }
    }

    public async refreshToken(provider: ProviderOAuth2, config: ProviderConfig, connection: Connection): Promise<object> {
        if (connection.credentials.type !== 'OAUTH2') {
            throw new NangoError('wrong_credentials_type');
        }

        const credentials = connection.credentials;

        if (config.provider !== 'facebook' && !credentials.refresh_token) {
            throw new NangoError('missing_refresh_token');
        } else if (config.provider === 'facebook' && !credentials.access_token) {
            throw new NangoError('missing_facebook_access_token');
        }

        switch (config.provider) {
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
            case 'facebook':
                return this.refreshFacebookToken(provider.token_url as string, credentials.access_token, config.oauth_client_id, config.oauth_client_secret);
            case 'tiktok-accounts':
                return this.refreshTiktokAccountsToken(
                    provider.refresh_url as string,
                    credentials.refresh_token as string,
                    config.oauth_client_id,
                    config.oauth_client_secret
                );
            case 'stripe-app':
            case 'stripe-app-sandbox':
                return this.refreshStripeAppToken(provider.token_url as string, credentials.refresh_token!, config.oauth_client_secret);
            default:
                throw new NangoError('unknown_provider_client');
        }
    }

    public async introspectedTokenExpired(config: ProviderConfig, connection: Connection): Promise<boolean> {
        if (connection.credentials.type !== 'OAUTH2') {
            throw new NangoError('wrong_credentials_type');
        }

        const credentials = connection.credentials;
        const oauthConnection = connection;

        switch (config.provider) {
            case 'salesforce':
            case 'salesforce-sandbox':
            case 'salesforce-experience-cloud':
                return this.introspectedSalesforceTokenExpired(
                    credentials.access_token,
                    config.oauth_client_id,
                    config.oauth_client_secret,
                    oauthConnection.connection_config as Record<string, string>
                );
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
            throw new NangoError('stripe_app_token_request_error', err.message);
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
            throw new NangoError('stripe_app_token_refresh_request_error', err.message);
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
            logger.error(err);
            // TODO add observability
            return false;
        }
    }
}

export default new ProviderClient();
