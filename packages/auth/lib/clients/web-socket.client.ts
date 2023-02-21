import type { WebSocket } from 'ws';
import * as uuid from 'uuid';
import logger from '../utils/logger.js';

const enum WSMessageType {
    ConnectionAck = 'connection_ack',
    Error = 'error',
    Success = 'success'
}

export const enum WSErrType {
    AuthMode = 'auth_mode_err',
    Callback = 'callback_err',
    GrantType = 'grant_type_err',
    MissingConnectionId = 'missing_connection_id',
    NoProviderConfigKey = 'no_provider_config_key',
    ProviderConfig = 'provider_config_err',
    RequestToken = 'req_token_err',
    State = 'state_err',
    Token = 'token_err',
    UnkownConfigKey = 'unknown_config_key',
    UrlParam = 'url_param_err'
}

export const enum WSErrParams {
    AuthMode = 'authMode',
    ConnectionConfig = 'connectionConfig',
    Error = 'error',
    GrantType = 'grantType',
    ProviderKey = 'providerConfigKey',
    State = 'state',
    Url = 'url'
}

const errDesc: Record<string, (params: Record<WSErrParams, string>) => string> = {
    [WSErrType.AuthMode]: (params) => `Auth mode ${params[WSErrParams.AuthMode]} not supported.`,
    [WSErrType.Callback]: (params) => `Did not get oauth_token and/or oauth_verifier in the callback: ${params[WSErrParams.Error]}.`,
    [WSErrType.GrantType]: (params) => `The grant type "${params[WSErrParams.GrantType]}" is not supported by this OAuth flow.`,
    [WSErrType.MissingConnectionId]: (_) => 'Missing connectionId.',
    [WSErrType.NoProviderConfigKey]: (_) => 'Missing provider unique key.',
    [WSErrType.ProviderConfig]: (params) => `Provider config "${params[WSErrParams.ProviderKey]}" is missing cliend ID, secret and/or scopes.`,
    [WSErrType.RequestToken]: (params) => `Error in the request token step of the OAuth 1.0a flow. Error: ${params[WSErrParams.Error]}`,
    [WSErrType.State]: (params) => `Invalid state parameter passed in the callback: ${params[WSErrParams.State]}`,
    [WSErrType.Token]: (params) => `Error storing/retrieving token: ${params[WSErrParams.Error]}.`,
    [WSErrType.UnkownConfigKey]: (params) => `No Provider configuration with key "${params[WSErrParams.ProviderKey]}".`,
    [WSErrType.UrlParam]: (params) =>
        `Missing param(s) in Auth request to interpolate url ${params['url']}. Provided params: ${params[WSErrParams.ConnectionConfig]}`
};

class WebSocketClient {
    private clients: Record<string, WebSocket> = {};

    public addClient(client: WebSocket, clientId = uuid.v4()): void {
        this.clients[clientId] = client;
        client.send(JSON.stringify({ message_type: WSMessageType.ConnectionAck, ws_client_id: clientId }));
    }

    removeClient(clientId: string): void {
        delete this.clients[clientId];
    }

    getClient(clientId: string): WebSocket | undefined {
        return this.clients[clientId];
    }

    public notifyError(
        clientId: string,
        providerConfigKey: string | undefined,
        connectionId: string,
        errorType: WSErrType,
        params: Record<string, string> = {}
    ) {
        let errorDescription = errDesc[errorType] != null ? errDesc[errorType]!(params) : 'No error description available.';

        logger.debug(`OAuth flow error for provider config "${providerConfigKey}" and connectionId "${connectionId}": ${errorType} - ${errorDescription}`);

        const client = this.getClient(clientId);
        if (client) {
            client.send(
                JSON.stringify({
                    message_type: WSMessageType.Error,
                    provider_config_key: providerConfigKey,
                    connection_id: connectionId,
                    error_type: errorType,
                    error_desc: errorDescription
                })
            );

            client.close();
            this.removeClient(clientId);
        }
    }

    public notifySuccess(clientId: string, providerConfigKey: string, connectionId: string) {
        const client = this.getClient(clientId);
        if (client) {
            client.send(
                JSON.stringify({
                    message_type: WSMessageType.Success,
                    provider_config_key: providerConfigKey,
                    connection_id: connectionId
                })
            );

            client.close();
            this.removeClient(clientId);
        }
    }
}

export default new WebSocketClient();
