import braintree from 'braintree';
import type { ProviderConfig, Connection, OAuth2Credentials } from '../models.js';

class ProviderClientManager {
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

    public async getToken(config: ProviderConfig, code: string): Promise<object> {
        switch (config.provider) {
            case 'braintree':
                return this.createBraintreeToken(code, config.oauth_client_id, config.oauth_client_secret);
            case 'braintree-sandbox':
                return this.createBraintreeToken(code, config.oauth_client_id, config.oauth_client_secret);
            default:
                throw Error('unknown_provider_client');
        }
    }

    public async refreshToken(config: ProviderConfig, connection: Connection): Promise<object> {
        let credentials = connection.credentials as OAuth2Credentials;

        if (!credentials.refresh_token) {
            throw Error('missing_refresh_token');
        }

        switch (config.provider) {
            case 'braintree':
                return this.refreshBraintreeToken(credentials.refresh_token, config.oauth_client_id, config.oauth_client_secret);
            case 'braintree-sandbox':
                return this.refreshBraintreeToken(credentials.refresh_token, config.oauth_client_id, config.oauth_client_secret);
            default:
                throw Error('unknown_provider_client');
        }
    }

    private async createBraintreeToken(code: string, clientId: string, clientSecret: string): Promise<object> {
        const gateway = new braintree.BraintreeGateway({ clientId: clientId, clientSecret: clientSecret });
        let res = await gateway.oauth.createTokenFromCode({ code: code });

        if (!('credentials' in res && 'accessToken' in res.credentials && 'refreshToken' in res.credentials && 'expiresAt' in res.credentials)) {
            throw Error('braintree_token_request_error');
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
            throw Error('braintree_token_refresh_error');
        }

        let creds = res['credentials'];

        return {
            access_token: creds['accessToken'],
            refresh_token: creds['refreshToken'],
            expires_at: creds['expiresAt']
        };
    }
}

export default new ProviderClientManager();
