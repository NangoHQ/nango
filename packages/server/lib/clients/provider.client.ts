import braintree from 'braintree';
import { ProviderConfig, Connection, OAuth2Credentials, ProviderAuthModes } from '../models.js';
import axios from 'axios';
import { isTokenExpired, parseTokenExpirationDate } from '../utils/utils.js';

class ProviderClient {
    constructor() {}

    public shouldUseProviderClient(provider: string): boolean {
        switch (provider) {
            case 'braintree':
                return true;
            case 'braintree-sandbox':
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

    public async getToken(config: ProviderConfig, code: string): Promise<object> {
        switch (config.provider) {
            case 'braintree':
                return this.createBraintreeToken(code, config.oauth_client_id, config.oauth_client_secret);
            case 'braintree-sandbox':
                return this.createBraintreeToken(code, config.oauth_client_id, config.oauth_client_secret);
            default:
                throw new Error('unknown_provider_client');
        }
    }

    public async refreshToken(config: ProviderConfig, connection: Connection): Promise<object> {
        if (connection.credentials.type != ProviderAuthModes.OAuth2) {
            throw new Error('wrong_credentials_type');
        }

        let credentials = connection.credentials as OAuth2Credentials;

        if (!credentials.refresh_token) {
            throw new Error('missing_refresh_token');
        }

        switch (config.provider) {
            case 'braintree':
                return this.refreshBraintreeToken(credentials.refresh_token, config.oauth_client_id, config.oauth_client_secret);
            case 'braintree-sandbox':
                return this.refreshBraintreeToken(credentials.refresh_token, config.oauth_client_id, config.oauth_client_secret);
            default:
                throw new Error('unknown_provider_client');
        }
    }

    public async introspectedTokenExpired(config: ProviderConfig, connection: Connection): Promise<boolean> {
        if (connection.credentials.type != ProviderAuthModes.OAuth2) {
            throw new Error('wrong_credentials_type');
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
                throw new Error('unknown_provider_client');
        }
    }

    private async createBraintreeToken(code: string, clientId: string, clientSecret: string): Promise<object> {
        const gateway = new braintree.BraintreeGateway({ clientId: clientId, clientSecret: clientSecret });
        let res = await gateway.oauth.createTokenFromCode({ code: code });

        if (!('credentials' in res && 'accessToken' in res.credentials && 'refreshToken' in res.credentials && 'expiresAt' in res.credentials)) {
            throw new Error('braintree_token_request_error');
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
            throw new Error('braintree_token_refresh_error');
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
            throw new Error('salesforce_instance_url_missing');
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
