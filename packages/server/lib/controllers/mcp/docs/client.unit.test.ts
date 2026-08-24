import { describe, expect, it, vi } from 'vitest';

import { PublicMcpError } from '../utils.js';
import { DocsMcpClient } from './client.js';

import type { ConnectDocsMcpClient, ConnectedDocsMcpClient } from './client.js';

describe('DocsMcpClient', () => {
    it('returns every text block without limiting its size', async () => {
        const callTool = vi.fn<ConnectedDocsMcpClient['callTool']>().mockResolvedValue({
            content: [
                { type: 'text', text: 'first result' },
                { type: 'text', text: 'second result' }
            ]
        });
        const connectedClient = mockConnectedClient(callTool);
        const connect = vi.fn<ConnectDocsMcpClient>().mockResolvedValue(connectedClient);
        const client = new DocsMcpClient(connect);

        const result = await client.callTool('search_nango_docs', { query: 'authentication' });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual(['first result', 'second result']);
        }
        expect(callTool).toHaveBeenCalledWith('search_nango_docs', { query: 'authentication' }, expect.any(AbortSignal));
        expect(connectedClient.close).toHaveBeenCalledOnce();
    });

    it('initializes and closes an MCP client for every tool call', async () => {
        const callTool = vi.fn<ConnectedDocsMcpClient['callTool']>().mockResolvedValue({ content: [{ type: 'text', text: 'result' }] });
        const connectedClient = mockConnectedClient(callTool);
        const connect = vi.fn<ConnectDocsMcpClient>().mockResolvedValue(connectedClient);
        const client = new DocsMcpClient(connect);

        await client.callTool('search_nango_docs', { query: 'authentication' });
        await client.callTool('query_docs_filesystem_nango_docs', { command: 'head -20 /quickstart.mdx' });

        expect(connect).toHaveBeenCalledTimes(2);
        expect(callTool).toHaveBeenCalledTimes(2);
        expect(connectedClient.close).toHaveBeenCalledTimes(2);
    });

    it('returns upstream tool error payloads verbatim', async () => {
        const callTool = vi.fn<ConnectedDocsMcpClient['callTool']>().mockResolvedValue({
            content: [{ type: 'text', text: '  Invalid documentation query\n' }],
            isError: true
        });
        const connectedClient = mockConnectedClient(callTool);
        const client = new DocsMcpClient(() => Promise.resolve(connectedClient));

        const result = await client.callTool('search_nango_docs', { query: 'authentication' });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toBe('  Invalid documentation query\n');
        }
        expect(connectedClient.close).toHaveBeenCalledOnce();
    });

    it.each([new Error('429 Too Many Requests'), new Error('Search rate limit exceeded'), Object.assign(new Error('Upstream request failed'), { code: 429 })])(
        'adds direct MCP guidance to rate limit errors',
        async (error) => {
            const callTool = vi.fn<ConnectedDocsMcpClient['callTool']>().mockRejectedValue(error);
            const connectedClient = mockConnectedClient(callTool);
            const client = new DocsMcpClient(() => Promise.resolve(connectedClient));

            const result = await client.callTool('search_nango_docs', { query: 'authentication' });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error).toBeInstanceOf(PublicMcpError);
                expect(result.error.message).toBe(
                    'The Nango documentation MCP returned 429 Too Many Requests. Connect to the Nango documentation MCP directly at https://nango.dev/docs/mcp.'
                );
            }
            expect(connectedClient.close).toHaveBeenCalledOnce();
        }
    );

    it('adds direct MCP guidance when an upstream tool result reports a rate limit', async () => {
        const callTool = vi.fn<ConnectedDocsMcpClient['callTool']>().mockResolvedValue({
            content: [{ type: 'text', text: 'Rate limit exceeded' }],
            isError: true
        });
        const connectedClient = mockConnectedClient(callTool);
        const client = new DocsMcpClient(() => Promise.resolve(connectedClient));

        const result = await client.callTool('query_docs_filesystem_nango_docs', { command: 'tree / -L 2' });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toContain('429 Too Many Requests');
            expect(result.error.message).toContain('https://nango.dev/docs/mcp');
        }
        expect(connectedClient.close).toHaveBeenCalledOnce();
    });

    it('can initialize on a later call after the connector fails', async () => {
        const callTool = vi.fn<ConnectedDocsMcpClient['callTool']>().mockResolvedValue({ content: [{ type: 'text', text: 'result' }] });
        const connectedClient = mockConnectedClient(callTool);
        const connect = vi.fn<ConnectDocsMcpClient>().mockRejectedValueOnce(new Error('Initialization failed')).mockResolvedValueOnce(connectedClient);
        const client = new DocsMcpClient(connect);

        const firstResult = await client.callTool('search_nango_docs', { query: 'authentication' });
        const secondResult = await client.callTool('search_nango_docs', { query: 'authentication' });

        expect(firstResult.isErr()).toBe(true);
        expect(secondResult.isOk()).toBe(true);
        expect(connect).toHaveBeenCalledTimes(2);
        expect(connectedClient.close).toHaveBeenCalledOnce();
    });
});

function mockConnectedClient(callTool: ConnectedDocsMcpClient['callTool']): ConnectedDocsMcpClient {
    return {
        callTool,
        close: vi.fn<ConnectedDocsMcpClient['close']>().mockResolvedValue(undefined)
    };
}
