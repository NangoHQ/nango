import axios from 'axios';

export class Pizzly {
    serverUrl: string;

    constructor(serverUrl?: string) {
        this.serverUrl = serverUrl || 'http://localhost:3004';
    }

    async auth(connectionId: string, integrationKey: string) {
        let url = `${this.serverUrl}/connection/${connectionId}`;

        let headers = {
            'Content-Type': 'application/json'
        };

        let params = {
            integration_key: integrationKey
        };

        let response = await axios.get(url, { params: params, headers: headers });

        return response.data.credentials;
    }
}
