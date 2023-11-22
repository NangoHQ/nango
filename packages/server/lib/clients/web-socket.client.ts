import type { WebSocket } from 'ws';
import * as uuid from 'uuid';
import logger from '../utils/logger.js';
import type { WSErr } from '../utils/web-socket-error.js';
import { errorHtml, successHtml } from '../utils/utils.js';

const enum WSMessageType {
    ConnectionAck = 'connection_ack',
    Error = 'error',
    Success = 'success'
}

class WSClient {
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

    public notifyErr(res: any, clientId: string | undefined, providerConfigKey: string | undefined, connectionId: string | undefined, wsErr: WSErr) {
        logger.debug(`OAuth flow error for provider config "${providerConfigKey}" and connectionId "${connectionId}": ${wsErr.type} - ${wsErr.message}`);

        if (clientId) {
            const client = this.getClient(clientId);
            if (client) {
                const data = {
                    message_type: WSMessageType.Error,
                    provider_config_key: providerConfigKey,
                    connection_id: connectionId,
                    error_type: wsErr.type,
                    error_desc: wsErr.message
                };
                // notify client synchronously to make sure auth is completed before sending the html that will close the window
                this.syncSend(client, data)
                    .catch((_error) => errorHtml(res, clientId, { type: 'timeout_error', message: 'Success message timed out' }))
                    .finally(() => {
                        client.close();
                        this.removeClient(clientId);
                    });
            }
        }

        errorHtml(res, clientId, wsErr);
    }

    public notifySuccess(res: any, clientId: string | undefined, providerConfigKey: string, connectionId: string) {
        if (clientId) {
            const client = this.getClient(clientId);
            if (client) {
                const data = {
                    message_type: WSMessageType.Success,
                    provider_config_key: providerConfigKey,
                    connection_id: connectionId
                };
                // notify client synchronously to make sure auth is completed before sending the html that will close the window
                this.syncSend(client, data)
                    .then((_res) => successHtml(res, clientId, providerConfigKey, connectionId))
                    .catch((_error) => errorHtml(res, clientId, { type: 'timeout_error', message: 'Success message timed out' }))
                    .finally(() => {
                        client.close();
                        this.removeClient(clientId);
                    });
            }
        } else {
            successHtml(res, clientId, providerConfigKey, connectionId);
        }
    }

    private syncSend(client: WebSocket, data: any) {
        const messageId = uuid.v4();
        const timeoutMs = 10000;
        const message = { messageId: messageId, data };

        const timeout = new Promise((_resolve, reject) => {
            setTimeout(() => {
                reject(new Error(`Synchronous websocket message '${messageId}' timed out after ${timeoutMs}ms`));
            }, timeoutMs);
        });
        const send = new Promise(function (resolve, reject) {
            client.onmessage = (message) => {
                const { messageId: responseId, data } = JSON.parse(message.data.toString());
                if (messageId === responseId) {
                    return resolve(data);
                }
            };

            client.onerror = (error) => {
                return reject(error);
            };

            client.send(JSON.stringify(message));
        });
        return Promise.race([send, timeout]);
    }
}

export default new WSClient();
