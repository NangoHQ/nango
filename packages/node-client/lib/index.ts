import axios from 'axios';

export class Nango {
    serverUrl: string;
    secretKey: string;

    constructor(serverUrl?: string, secretKey = '') {
        this.serverUrl = serverUrl || 'http://localhost:3003';

        if (this.serverUrl.slice(-1) === '/') {
            this.serverUrl = this.serverUrl.slice(0, -1);
        }

        try {
            new URL(this.serverUrl);
        } catch (err) {
            throw new Error(`Invalid URL provided for the Nango host: ${this.serverUrl}`);
        }

        this.secretKey = secretKey;
    }

    /**
     * Get fresh access credentials to authenticate your requests.
     *
     * @remarks
     * For OAuth 2: returns the access token directly as a string.
     * For OAuth 1: returns an object with 'oAuthToken' and 'oAuthTokenSecret' fields.
     */
    public async getToken(providerConfigKey: string, connectionId: string) {
        let response = await this.getConnectionDetails(providerConfigKey, connectionId);

        switch (response.data.credentials.type) {
            case 'OAUTH2':
                return response.data.credentials.access_token;
            case 'OAUTH1':
                return { oAuthToken: response.data.credentials.oauth_token, oAuthTokenSecret: response.data.credentials.oauth_token_secret };
            default:
                throw Error(`Unrecognized OAuth type '${response.data.credentials.type}' in stored credentials.`);
        }
    }

    /**
     * Get the full (fresh) credentials payload returned by the external API, which also contains access credentials.
     */
    public async getRawTokenResponse(providerConfigKey: string, connectionId: string) {
        let response = await this.getConnectionDetails(providerConfigKey, connectionId);
        return response.data.credentials.raw;
    }

    /**
     * Get the Connection object, which also contains access credentials and full credentials payload returned by the external API.
     */
    public async getConnection(providerConfigKey: string, connectionId: string) {
        let response = await this.getConnectionDetails(providerConfigKey, connectionId);
        return response.data;
    }

    private async getConnectionDetails(providerConfigKey: string, connectionId: string) {
        let url = `${this.serverUrl}/connection/${connectionId}`;

        let headers = {
            'Content-Type': 'application/json',
            'Accept-Encoding': 'application/json'
        };

        let params = {
            provider_config_key: providerConfigKey
        };

        return await axios.get(url, { params: params, headers: this.enrichHeaders(headers) });
    }

    private enrichHeaders(headers: Record<string, string | number | boolean> = {}) {
        if (this.secretKey) {
            headers['Authorization'] = 'Basic ' + Buffer.from(this.secretKey + ':').toString('base64');
        }

        return headers;
    }
}
