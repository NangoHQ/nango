import braintree from 'braintree';
import {
    Config as ProviderConfig,
    Connection,
    OAuth2Credentials,
    AuthModes as ProviderAuthModes,
    AuthorizationTokenResponse,
    RefreshTokenResponse,
    TemplateOAuth2 as ProviderTemplateOAuth2
} from '../models/index.js';
import axios from 'axios';
import qs from 'qs';
import { parseTokenExpirationDate, isTokenExpired } from '../utils/utils.js';
import { NangoError } from '../utils/error.js';

class ProviderClient {
    public shouldUseProviderClient(provider: string): boolean {
        switch (provider) {
            case 'braintree':
            case 'braintree-sandbox':
            case 'figma':
            case 'figjam':
            case 'facebook':
            case 'tiktok-ads':
            case 'tiktok-accounts':
                return true;
            default:
                return false;
        }
    }

    public shouldIntrospectToken(provider: string): boolean {
        switch (provider) {
            case 'salesforce':
            case 'salesforce-sandbox':
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
            case 'figma':
            case 'figjam':
                return this.createFigmaToken(tokenUrl, code, config.oauth_client_id, config.oauth_client_secret, callBackUrl);
            case 'facebook':
                return this.createFacebookToken(tokenUrl, code, config.oauth_client_id, config.oauth_client_secret, callBackUrl, codeVerifier);
            case 'tiktok-ads':
                return this.createTiktokAdsToken(tokenUrl, code, config.oauth_client_id, config.oauth_client_secret);
            case 'tiktok-accounts':
                return this.createTiktokAccountsToken(tokenUrl, code, config.oauth_client_id, config.oauth_client_secret, callBackUrl);
            default:
                throw new NangoError('unknown_provider_client');
        }
    }

    public async refreshToken(template: ProviderTemplateOAuth2, config: ProviderConfig, connection: Connection): Promise<object> {
        if (connection.credentials.type != ProviderAuthModes.OAuth2) {
            throw new NangoError('wrong_credentials_type');
        }

        const credentials = connection.credentials as OAuth2Credentials;

        if (config.provider !== 'facebook' && !credentials.refresh_token) {
            throw new NangoError('missing_refresh_token');
        } else if (config.provider === 'facebook' && !credentials.access_token) {
            throw new NangoError('missing_facebook_access_token');
        }

        switch (config.provider) {
            case 'braintree':
            case 'braintree-sandbox':
                return this.refreshBraintreeToken(credentials.refresh_token!, config.oauth_client_id, config.oauth_client_secret);
            case 'figma':
            case 'figjam':
                return this.refreshFigmaToken(template.refresh_url as string, credentials.refresh_token!, config.oauth_client_id, config.oauth_client_secret);
            case 'facebook':
                return this.refreshFacebookToken(template.token_url as string, credentials.access_token, config.oauth_client_id, config.oauth_client_secret);
            case 'tiktok-accounts':
                return this.refreshTiktokAccountsToken(
                    template.refresh_url as string,
                    credentials.refresh_token as string,
                    config.oauth_client_id,
                    config.oauth_client_secret
                );
            default:
                throw new NangoError('unknown_provider_client');
        }
    }

    public async introspectedTokenExpired(config: ProviderConfig, connection: Connection): Promise<boolean> {
        if (connection.credentials.type != ProviderAuthModes.OAuth2) {
            throw new NangoError('wrong_credentials_type');
        }

        const credentials = connection.credentials as OAuth2Credentials;
        const oauthConnection = connection as Connection;

        switch (config.provider) {
            case 'salesforce':
            case 'salesforce-sandbox':
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
        } catch (e: any) {
            throw new NangoError('tiktok_token_request_error', e.message);
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

            if (response.status === 200 && response.data !== null) {
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
            throw new NangoError('tiktok_token_request_error');
        } catch (e: any) {
            throw new NangoError('tiktok_token_request_error', e.message);
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

            if (response.status === 200 && response.data !== null) {
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
        } catch (e: any) {
            throw new NangoError('tiktok_token_refresh_request_error', e.message);
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
        } catch (e) {
            // TODO add observability
            return false;
        }
    }
}

export default new ProviderClient();
