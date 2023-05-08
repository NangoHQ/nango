import axios from 'axios';
import { validateProxyConfiguration } from './utils.js';

import type { ProxyConfiguration } from './types';

const prodHost = 'https://api.nango.dev';
const stagingHost = 'https://api-staging.nango.dev';
const forceBearerAuth = true; // For development.

export class Nango {
    serverUrl: string;
    secretKey: string;

    constructor(config: { host?: string; secretKey?: string } = {}) {
        config.host = config.host || prodHost;
        this.serverUrl = config.host;

        if (this.serverUrl.slice(-1) === '/') {
            this.serverUrl = this.serverUrl.slice(0, -1);
        }

        try {
            new URL(this.serverUrl);
        } catch (err) {
            throw new Error(`Invalid URL provided for the Nango host: ${this.serverUrl}`);
        }

        this.secretKey = config.secretKey || '';
    }

    /**
     * For OAuth 2: returns the access token directly as a string.
     * For OAuth 2: If you want to obtain a new refresh token from the provider before the current token has expired,
     * you can set the forceRefresh argument to true."
     * For OAuth 1: returns an object with 'oAuthToken' and 'oAuthTokenSecret' fields.
     * @param providerConfigKey - This is the unique Config Key for the integration
     * @param connectionId - This is the unique connection identifier used to identify this connection
     * @param [forceRefresh] - When set, this is used to  obtain a new refresh token from the provider before the current token has expired,
     * you can set the forceRefresh argument to true.
     * */
    public async getToken(providerConfigKey: string, connectionId: string, forceRefresh?: boolean) {
        let response = await this.getConnectionDetails(providerConfigKey, connectionId, forceRefresh);

        switch (response.data.credentials.type) {
            case 'OAUTH2':
                return response.data.credentials.access_token;
            case 'OAUTH1':
                return { oAuthToken: response.data.credentials.oauth_token, oAuthTokenSecret: response.data.credentials.oauth_token_secret };
            default:
                throw new Error(`Unrecognized OAuth type '${response.data.credentials.type}' in stored credentials.`);
        }
    }

    /**
     * Get the full (fresh) credentials payload returned by the external API,
     * which also contains access credentials.
     * @param providerConfigKey - This is the unique Config Key for the integration
     * @param connectionId - This is the unique connection identifier used to identify this connection
     * @param [forceRefresh] - When set, this is used to  obtain a new refresh token from the provider before the current token has expired,
     * you can set the forceRefresh argument to true.
     * */
    public async getRawTokenResponse(providerConfigKey: string, connectionId: string, forceRefresh?: boolean) {
        let response = await this.getConnectionDetails(providerConfigKey, connectionId, forceRefresh);
        return response.data.credentials.raw;
    }

    /**
     * Get the Connection object, which also contains access credentials and full credentials payload
     * returned by the external API.
     * @param providerConfigKey - This is the unique Config Key for the integration
     * @param connectionId - This is the unique connection identifier used to identify this connection
     * @param [forceRefresh] - When set, this is used to  obtain a new refresh token from the provider before the current token has expired,
     * you can set the forceRefresh argument to true.
     */
    public async getConnection(providerConfigKey: string, connectionId: string, forceRefresh?: boolean) {
        let response = await this.getConnectionDetails(providerConfigKey, connectionId, forceRefresh);
        return response.data;
    }

    public async proxy(config: ProxyConfiguration) {
        validateProxyConfiguration(config);

        const { providerConfigKey, connectionId, method, retries } = config;

        const url = `${this.serverUrl}/proxy/${config.endpoint}`;

        const headers: Record<string, string | number | boolean> = {
            'Connection-Id': connectionId,
            'Provider-Config-Key': providerConfigKey
        };

        if (retries) {
            headers['Retries'] = retries;
        }

        const options = {
            headers: this.enrichHeaders(headers)
        };

        if (method?.toUpperCase() === 'POST') {
            return axios.post(url, config.data, options);
        } else if (method?.toUpperCase() === 'PATCH') {
            return axios.patch(url, config.data, options);
        } else if (method?.toUpperCase() === 'PUT') {
            return axios.put(url, config.data, options);
        } else if (method?.toUpperCase() === 'DELETE') {
            return axios.delete(url, options);
        } else {
            return axios.get(url, options);
        }
    }

    public async get(config: ProxyConfiguration) {
        return this.proxy({
            ...config,
            method: 'GET'
        });
    }

    public async post(config: ProxyConfiguration) {
        return this.proxy({
            ...config,
            method: 'POST'
        });
    }

    public async patch(config: ProxyConfiguration) {
        return this.proxy({
            ...config,
            method: 'PATCH'
        });
    }

    public async delete(config: ProxyConfiguration) {
        return this.proxy({
            ...config,
            method: 'DELETE'
        });
    }

    public async ticketing(config: { providerConfigKey: string; connectionId: string }) {
        const { providerConfigKey, connectionId } = config;

        const url = `${this.serverUrl}/unified-apis/ticketing/tickets`;
        const headers: Record<string, string | number | boolean> = {
            'Connection-Id': connectionId,
            'Provider-Config-Key': providerConfigKey
        };

        const options = {
            headers: this.enrichHeaders(headers)
        };

        return axios.get(url, options);
    }

    private async getConnectionDetails(providerConfigKey: string, connectionId: string, forceRefresh = false) {
        let url = `${this.serverUrl}/connection/${connectionId}`;

        let headers = {
            'Content-Type': 'application/json',
            'Accept-Encoding': 'application/json'
        };

        let params = {
            provider_config_key: providerConfigKey,
            force_refresh: forceRefresh
        };

        return axios.get(url, { params: params, headers: this.enrichHeaders(headers) });
    }

    /**
     * Get the list of Connections, which does not contain access credentials.
     */
    public async listConnections(connectionId?: string) {
        let response = await this.listConnectionDetails(connectionId);
        return response.data;
    }

    private async listConnectionDetails(connectionId?: string) {
        let url = `${this.serverUrl}/connection?`;
        if (connectionId) {
            url.concat(`connectionId=${connectionId}`);
        }

        let headers = {
            'Content-Type': 'application/json',
            'Accept-Encoding': 'application/json'
        };

        return axios.get(url, { headers: this.enrichHeaders(headers) });
    }

    private enrichHeaders(headers: Record<string, string | number | boolean> = {}) {
        if (this.serverUrl === prodHost || this.serverUrl === stagingHost || forceBearerAuth) {
            headers['Authorization'] = 'Bearer ' + this.secretKey;
        } else if (this.secretKey) {
            headers['Authorization'] = 'Basic ' + Buffer.from(this.secretKey + ':').toString('base64');
        }

        return headers;
    }
}
