import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthorizationModal } from './authModal.js';

import type { AuthErrorType, AuthSuccess } from './types.js';

/**
 * Minimal WebSocket stub that lets the test drive the socket lifecycle
 * (incoming messages and close events) without a real network connection.
 */
class MockWebSocket {
    static instances: MockWebSocket[] = [];

    public onmessage: ((event: { data: string }) => void) | null = null;
    public onclose: (() => void) | null = null;
    public readyState = 0;

    constructor(public url: string) {
        MockWebSocket.instances.push(this);
    }

    /** Simulate a message pushed by the server. */
    receive(data: unknown): void {
        this.onmessage?.({ data: JSON.stringify(data) });
    }

    /** Simulate the socket closing (e.g. server idle timeout). */
    close(): void {
        if (this.readyState === 3) {
            return;
        }
        this.readyState = 3;
        this.onclose?.();
    }
}

function createModal() {
    const successHandler = vi.fn<(authSuccess: AuthSuccess) => void>();
    const errorHandler = vi.fn<(errorType: AuthErrorType, errorDesc: string) => void>();

    const modal = new AuthorizationModal({
        baseUrl: new URL('https://api.nango.dev/oauth/connect/hubspot'),
        debug: false,
        webSocketUrl: 'wss://api.nango.dev/',
        successHandler,
        errorHandler
    });

    return { modal, successHandler, errorHandler, socket: MockWebSocket.instances.at(-1)! };
}

describe('AuthorizationModal websocket lifecycle', () => {
    beforeEach(() => {
        MockWebSocket.instances = [];
        vi.stubGlobal('WebSocket', MockWebSocket);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('rejects the pending auth flow when the socket closes on idle timeout before a result (regression for #5849)', () => {
        const { successHandler, errorHandler, socket } = createModal();

        // Server acknowledges the connection but the OAuth flow takes too long,
        // so the socket is dropped on idle timeout before any success message.
        socket.receive({ message_type: 'connection_ack', ws_client_id: 'ws-1' });
        socket.close();

        expect(successHandler).not.toHaveBeenCalled();
        expect(errorHandler).toHaveBeenCalledTimes(1);
        expect(errorHandler.mock.calls[0]?.[0]).toBe('connection_timeout');
    });

    it('resolves on success and does not fire the timeout fallback when the socket then closes', () => {
        const { successHandler, errorHandler, socket } = createModal();

        socket.receive({ message_type: 'connection_ack', ws_client_id: 'ws-2' });
        socket.receive({
            message_type: 'success',
            provider_config_key: 'hubspot',
            connection_id: 'conn-123',
            is_pending: false
        });

        // The success handler closes the socket, which triggers onclose - the
        // fallback must stay quiet because the flow already resolved.
        expect(successHandler).toHaveBeenCalledTimes(1);
        expect(successHandler.mock.calls[0]?.[0]).toEqual({
            providerConfigKey: 'hubspot',
            connectionId: 'conn-123',
            isPending: false
        });
        expect(errorHandler).not.toHaveBeenCalled();
    });

    it('does not turn a server error into a duplicate timeout rejection when the socket closes', () => {
        const { successHandler, errorHandler, socket } = createModal();

        socket.receive({ message_type: 'error', error_type: 'invalid_credentials', error_desc: 'nope' });

        expect(successHandler).not.toHaveBeenCalled();
        expect(errorHandler).toHaveBeenCalledTimes(1);
        expect(errorHandler.mock.calls[0]?.[0]).toBe('invalid_credentials');
    });
});
