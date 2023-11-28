import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Publisher, WebSocketClientId } from './publisher.client';
import type { WebSocket } from 'ws';
import * as uuid from 'uuid';

const mockWebsocket = () => {
    const mock = {} as any;
    mock.send = vi.fn();
    return mock as WebSocket;
};

const mockRes = ({ status }: { status: Number }) => {
    const mock = {} as any;
    mock.status = () => status;
    mock.set = vi.fn();
    mock.send = vi.fn();
    return mock as any;
};

class MockRedis {
    // Caveat: only one subscription per channel is supported
    private subscriptions = new Map<string, (message: string, channel: string) => void>();

    public async publish(channel: string, message: string) {
        const onMessage = this.subscriptions.get(channel);
        if (onMessage) {
            onMessage(message, channel);
        }
        return true;
    }

    public async subscribe(channel: string, onMessage: (message: string, channel: string) => void) {
        this.subscriptions.set(channel, onMessage);
        return true;
    }

    public async unsubscribe(channel: string) {
        this.subscriptions.delete(channel);
        return true;
    }
}
const mockRedis = new MockRedis() as any;

describe('Publisher', () => {
    let publisher1: Publisher;
    let publisher2: Publisher;
    let wsClientId: WebSocketClientId;
    let ws: WebSocket;

    beforeEach(() => {
        publisher1 = new Publisher(mockRedis);
        publisher2 = new Publisher(mockRedis);
        wsClientId = uuid.v4();
        ws = mockWebsocket();
    });

    it('knowns about the websocket connection', async () => {
        const res = mockRes({ status: 200 });

        vi.spyOn(publisher1, 'unsubscribe');
        vi.spyOn(publisher2, 'unsubscribe');

        await publisher1.subscribe(ws, wsClientId);

        expect(ws.send).toHaveBeenCalledWith(
            JSON.stringify({
                message_type: 'connection_ack',
                ws_client_id: wsClientId
            })
        );

        await publisher1.notifySuccess(res, wsClientId, 'provider-key', 'connection-id');

        expect(ws.send).toHaveBeenCalledWith(
            JSON.stringify({
                message_type: 'success',
                provider_config_key: 'provider-key',
                connection_id: 'connection-id'
            })
        );
        expect(ws.send).toHaveBeenCalledTimes(2); // connection_ack + success
        expect(publisher1.unsubscribe).toHaveBeenCalledTimes(1);
        expect(publisher2.unsubscribe).toHaveBeenCalledTimes(0);
    });

    it('does not known about the websocket connection', async () => {
        const res = mockRes({ status: 200 });

        vi.spyOn(publisher1, 'unsubscribe');

        await publisher1.subscribe(ws, wsClientId);
        await publisher2.notifySuccess(res, wsClientId, 'provider-key', 'connection-id'); // publisher2 does not know about the websocket connection

        expect(ws.send).toHaveBeenCalledTimes(2); // connection_ack + success
        expect(publisher1.unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('notifies of an error', async () => {
        const res = mockRes({ status: 500 });

        vi.spyOn(publisher1, 'unsubscribe');

        await publisher1.subscribe(ws, wsClientId);
        await publisher1.notifyErr(res, wsClientId, 'provider-key', 'connection-id', {} as any);
        expect(ws.send).toHaveBeenCalledTimes(2); // connection_ack + error
        expect(publisher1.unsubscribe).toHaveBeenCalledTimes(1);
    });
});
