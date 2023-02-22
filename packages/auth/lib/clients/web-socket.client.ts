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
                client.send(
                    JSON.stringify({
                        message_type: WSMessageType.Error,
                        provider_config_key: providerConfigKey,
                        connection_id: connectionId,
                        error_type: wsErr.type,
                        error_desc: wsErr.message
                    })
                );

                client.close();
                this.removeClient(clientId);
            }
        }

        errorHtml(res, clientId, wsErr);
    }

    public notifySuccess(res: any, clientId: string | undefined, providerConfigKey: string, connectionId: string) {
        if (clientId) {
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

        successHtml(res, clientId, providerConfigKey, connectionId);
    }
}

export default new WSClient();
