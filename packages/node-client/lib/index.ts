import axios from 'axios';

export class Pizzly {
    serverUrl: string;

    constructor(serverUrl?: string) {
        this.serverUrl = serverUrl || 'http://localhost:3004';
    }

    async rawTokenResponse(connectionId: string, providerConfigKey: string) {
        let url = `${this.serverUrl}/connection/${connectionId}`;

        let headers = {
            'Content-Type': 'application/json'
        };

        let params = {
            provider_config_key: providerConfigKey
        };

        let response = await axios.get(url, { params: params, headers: headers });

        return response.data.credentials.raw;
    }

    async accessToken(connectionId: string, providerConfigKey: string) {
        let url = `${this.serverUrl}/connection/${connectionId}`;

        let headers = {
            'Content-Type': 'application/json'
        };

        let params = {
            providerConfigKey: providerConfigKey
        };

        let response = await axios.get(url, { params: params, headers: headers });

        return response.data.credentials.accessToken;
    }
}
