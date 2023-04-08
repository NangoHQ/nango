import braintree from 'braintree';
import {
    ProviderConfig,
    Connection,
    OAuth2Credentials,
    ProviderAuthModes,
    AuthorizationTokenResponse,
    RefreshTokenResponse,
    ProviderTemplateOAuth2
} from '../models.js';
import axios from 'axios';
import { isTokenExpired, parseTokenExpirationDate } from '../utils/utils.js';
import { NangoError } from '../utils/error.js';

class ProviderClient {
    constructor() {}

    public shouldUseProviderClient(provider: string): boolean {
        switch (provider) {
            case 'braintree':
                return true;
            case 'braintree-sandbox':
                return true;
            case 'figma':
            case 'figjam':
                return true;
            default:
                return false;
        }
    }

    public shouldIntrospectToken(provider: string): boolean {
        switch (provider) {
            case 'salesforce':
                return true;
            default:
                return false;
        }
    }

    public async getToken(config: ProviderConfig, tokenUrl: string, code: string, callBackUrl: string): Promise<object> {
        switch (config.provider) {
            case 'braintree':
                return this.createBraintreeToken(code, config.oauth_client_id, config.oauth_client_secret);
            case 'braintree-sandbox':
                return this.createBraintreeToken(code, config.oauth_client_id, config.oauth_client_secret);
            case 'figma':
            case 'figjam':
                return this.createFigmaToken(tokenUrl, code, config.oauth_client_id, config.oauth_client_secret, callBackUrl);
            default:
                throw new NangoError('unknown_provider_client');
        }
    }

    public async refreshToken(template: ProviderTemplateOAuth2, config: ProviderConfig, connection: Connection): Promise<object> {
        if (connection.credentials.type != ProviderAuthModes.OAuth2) {
            throw new NangoError('wrong_credentials_type');
        }

        let credentials = connection.credentials as OAuth2Credentials;

        if (!credentials.refresh_token) {
            throw new NangoError('missing_refresh_token');
        }

        switch (config.provider) {
            case 'braintree':
                return this.refreshBraintreeToken(credentials.refresh_token, config.oauth_client_id, config.oauth_client_secret);
            case 'braintree-sandbox':
                return this.refreshBraintreeToken(credentials.refresh_token, config.oauth_client_id, config.oauth_client_secret);
            case 'figma':
            case 'figjam':
                return this.refreshFigmaToken(template.refresh_url as string, credentials.refresh_token, config.oauth_client_id, config.oauth_client_secret);
            default:
                throw new NangoError('unknown_provider_client');
        }
    }

    public async introspectedTokenExpired(config: ProviderConfig, connection: Connection): Promise<boolean> {
        if (connection.credentials.type != ProviderAuthModes.OAuth2) {
            throw new NangoError('wrong_credentials_type');
        }

        let credentials = connection.credentials as OAuth2Credentials;

        switch (config.provider) {
            case 'salesforce':
                return this.introspectedSalesforceTokenExpired(
                    credentials.access_token,
                    config.oauth_client_id,
                    config.oauth_client_secret,
                    connection.metadata
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
        let params = new URLSearchParams();
        params.set('redirect_uri', callBackUrl);
        const body = {
            client_id: clientId,
            client_secret: clientSecret,
            code: code,
            grant_type: 'authorization_code'
        };
        const url = `${tokenUrl}?${params.toString()}`;
        let response = await axios.post(url, body);
        if (response.status === 200 && response.data !== null) {
            return {
                access_token: response.data['access_token'],
                refresh_token: response.data['refresh_token'],
                expires_in: response.data['expires_in']
            };
        }
        throw new NangoError('figma_token_request_error');
    }

    private async refreshFigmaToken(refreshTokenUrl: string, refreshToken: string, clientId: string, clientSecret: string): Promise<RefreshTokenResponse> {
        const body = {
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken
        };
        let response = await axios.post(refreshTokenUrl, body);
        if (response.status === 200 && response.data !== null) {
            return {
                refresh_token: refreshToken,
                access_token: response.data['access_token'],
                expires_in: response.data['expires_in']
            };
        }
        throw new NangoError('figma_refresh_token_request_error');
    }

    private async createBraintreeToken(code: string, clientId: string, clientSecret: string): Promise<object> {
        const gateway = new braintree.BraintreeGateway({ clientId: clientId, clientSecret: clientSecret });
        let res = await gateway.oauth.createTokenFromCode({ code: code });

        if (!('credentials' in res && 'accessToken' in res.credentials && 'refreshToken' in res.credentials && 'expiresAt' in res.credentials)) {
            throw new NangoError('braintree_token_request_error');
        }

        let creds = res['credentials'];

        return {
            access_token: creds['accessToken'],
            refresh_token: creds['refreshToken'],
            expires_at: creds['expiresAt']
        };
    }

    private async refreshBraintreeToken(refreshToken: string, clientId: string, clientSecret: string): Promise<object> {
        const gateway = new braintree.BraintreeGateway({ clientId: clientId, clientSecret: clientSecret });
        let res = await gateway.oauth.createTokenFromRefreshToken({ refreshToken: refreshToken });

        if (!('credentials' in res && 'accessToken' in res.credentials && 'refreshToken' in res.credentials && 'expiresAt' in res.credentials)) {
            throw new NangoError('braintree_token_refresh_error');
        }

        let creds = res['credentials'];

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
        metadata: Record<string, string>
    ): Promise<boolean> {
        if (!metadata['instance_url']) {
            throw new NangoError('salesforce_instance_url_missing');
        }

        let url = `${metadata['instance_url']}/services/oauth2/introspect`;

        let headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept-Encoding': 'application/json'
        };

        let body = {
            token: accessToken,
            client_id: clientId,
            client_secret: clientSecret,
            token_type_hint: 'access_token'
        };

        let res = await axios.post(url, body, { headers: headers });

        if (res.status != 200 || res.data == null || !res.data['active'] || res.data['exp'] == null) {
            return true;
        }

        let expireDate = parseTokenExpirationDate(res.data['exp']);

        return isTokenExpired(expireDate);
    }
}

export default new ProviderClient();
