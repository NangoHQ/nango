import axios from 'axios';

export class Pizzly {
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
            throw new Error(`Invalid URL provided for the Pizzly host: ${this.serverUrl}`);
        }

        this.secretKey = secretKey;
    }

    async rawTokenResponse(providerConfigKey: string, connectionId: string) {
        let url = `${this.serverUrl}/connection/${connectionId}`;

        let headers = {
            'Content-Type': 'application/json'
        };

        let params = {
            provider_config_key: providerConfigKey
        };

        let response = await axios.get(url, { params: params, headers: this.enrichHeaders(headers) });

        return response.data.credentials.raw;
    }

    async accessToken(providerConfigKey: string, connectionId: string) {
        let url = `${this.serverUrl}/connection/${connectionId}`;

        let headers = {
            'Content-Type': 'application/json'
        };

        let params = {
            provider_config_key: providerConfigKey
        };

        let response = await axios.get(url, { params: params, headers: this.enrichHeaders(headers) });

        switch (response.data.credentials.type) {
            case 'OAUTH2':
                return response.data.credentials.access_token;
            case 'OAUTH1':
                return { oAuthToken: response.data.credentials.oauth_token, oAuthTokenSecret: response.data.credentials.oauth_token_secret };
            default:
                throw Error(`Unrecognized OAuth type '${response.data.credentials.type}' in stored credentials.`);
        }
    }

    private enrichHeaders(headers: Record<string, string | number | boolean> = {}) {
        if (this.secretKey) {
            headers['Authorization'] = 'Basic ' + Buffer.from(process.env['PIZZLY_SECRET_KEY'] + ':').toString('base64');
        }

        return headers;
    }
}
