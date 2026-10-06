import { describe, expect, it } from 'vitest';

import { parseMessages } from './remoteMcp.service.js';

describe('parseMessages', () => {
    it('reads a JSON response', () => {
        expect(parseMessages({ contentType: 'application/json', text: '{"jsonrpc":"2.0","id":1,"result":{"tools":[]}}' })).toEqual([
            { jsonrpc: '2.0', id: 1, result: { tools: [] } }
        ]);
    });

    it('reads every message out of an event stream', () => {
        const text =
            'event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\n\nevent: message\ndata: {"jsonrpc":"2.0","id":2,"result":{}}\n\n';

        expect(parseMessages({ contentType: 'text/event-stream; charset=utf-8', text })).toEqual([
            { jsonrpc: '2.0', method: 'notifications/progress' },
            { jsonrpc: '2.0', id: 2, result: {} }
        ]);
    });

    it('treats an empty body as no messages', () => {
        expect(parseMessages({ contentType: undefined, text: '' })).toEqual([]);
    });

    it('rejects a body that is not JSON-RPC', () => {
        expect(parseMessages({ contentType: 'application/json', text: '{"ok":true}' })).toBeNull();
        expect(parseMessages({ contentType: 'text/html', text: '<html></html>' })).toBeNull();
    });
});
