import { Readable } from 'node:stream';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import { ProxyServiceError } from './proxy.service.js';

import type { ProxyServiceRequest, ProxyServiceResponse } from './proxy.service.js';
import type { DBEnvironment, DBTeam } from '@nangohq/types';

const request = vi.fn();
vi.mock('./proxy.service.js', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    default: { request: (...args: unknown[]) => request(...args) }
}));

const { listRemoteTools, withRemoteMcpSession } = await import('./remoteMcp.service.js');

const TARGET = {
    account: { id: 1 } as DBTeam,
    environment: { id: 1 } as DBEnvironment,
    plan: null,
    integrationId: 'linear-mcp',
    connectionId: 'linear-acme',
    provider: 'linear-mcp'
};

interface RpcMessage {
    id?: number;
    method: string;
    params?: { cursor?: string };
}

function response({ status = 200, body = '', headers = {} }: { status?: number; body?: string; headers?: Record<string, string> }) {
    const value: ProxyServiceResponse = {
        outcome: status >= 400 ? 'upstream_error' : 'success',
        status,
        headers: { 'content-type': 'application/json', ...headers },
        body: Readable.from([Buffer.from(body)]),
        complete: () => Promise.resolve()
    };
    return { logCtx: { id: 'log-1' }, result: Ok(value) };
}

function rpcResult(id: number | undefined, result: unknown) {
    return response({ body: JSON.stringify({ jsonrpc: '2.0', id, result }) });
}

/** Answers the handshake, then hands `onCall` every later JSON-RPC request. */
function mcpServer(onCall: (message: RpcMessage, params: ProxyServiceRequest) => ReturnType<typeof response> | Promise<ReturnType<typeof response>>) {
    request.mockImplementation((params: ProxyServiceRequest) => {
        const message = typeof params.body === 'string' ? (JSON.parse(params.body) as RpcMessage) : undefined;
        if (params.method === 'DELETE' || message?.id === undefined) {
            return Promise.resolve(response({ status: 202 }));
        }
        if (message.method === 'initialize') {
            return Promise.resolve(
                response({
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: message.id,
                        result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'linear', version: '1' } }
                    }),
                    headers: { 'mcp-session-id': 'remote-session' }
                })
            );
        }
        return Promise.resolve(onCall(message, params));
    });
}

function tool(name: string) {
    return { name, description: `${name} description`, inputSchema: { type: 'object' } };
}

async function list() {
    return await withRemoteMcpSession(TARGET, async (client) => await listRemoteTools(client, { maxTools: 3 }));
}

function sentRequests(): ProxyServiceRequest[] {
    return request.mock.calls.map(([params]) => params as ProxyServiceRequest);
}

describe('listRemoteTools through the proxy', () => {
    beforeEach(() => {
        request.mockReset();
    });

    it('lists every page, sends each request to the MCP endpoint under one operation, and closes the session', async () => {
        mcpServer((message) =>
            message.params?.cursor
                ? rpcResult(message.id, { tools: [tool('create_issue')] })
                : rpcResult(message.id, { tools: [{ ...tool('list_issues'), annotations: { readOnlyHint: true } }], nextCursor: 'page-2' })
        );

        const { logOperationId, result } = await list();

        expect(result.unwrap()).toEqual([
            { name: 'list_issues', description: 'list_issues description', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
            { name: 'create_issue', description: 'create_issue description', inputSchema: { type: 'object' } }
        ]);
        expect(logOperationId).toBe('log-1');
        expect(sentRequests().every((params) => params.endpoint === '/mcp' && params.integrationId === 'linear-mcp')).toBe(true);
        expect(
            sentRequests()
                .slice(1)
                .every((params) => params.activityLogId === 'log-1')
        ).toBe(true);
        expect(sentRequests().some((params) => params.method === 'GET')).toBe(false);
        expect(sentRequests().at(-1)).toMatchObject({ method: 'DELETE', headers: { 'mcp-session-id': 'remote-session' } });
    });

    it('reads a result sent as an event stream', async () => {
        mcpServer((message) =>
            response({
                body: `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { tools: [tool('list_issues')] } })}\n\n`,
                headers: { 'content-type': 'text/event-stream' }
            })
        );

        expect((await list()).result.unwrap().map((listed) => listed.name)).toEqual(['list_issues']);
    });

    it('keeps the first tools when a server lists more than a session takes', async () => {
        mcpServer((message) => rpcResult(message.id, { tools: ['a', 'b', 'c', 'd'].map(tool) }));

        expect((await list()).result.unwrap().map((listed) => listed.name)).toEqual(['a', 'b', 'c']);
    });

    it('reports a server refusing the credentials with its status', async () => {
        request.mockResolvedValue(response({ status: 401 }));

        const { result } = await list();

        expect(result.isErr() && result.error).toMatchObject({ code: 'http_error', status: 401, method: 'initialize' });
    });

    it('reports a rejected request as an RPC error naming the method', async () => {
        mcpServer((message) => response({ body: JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } }) }));

        const { result } = await list();

        expect(result.isErr() && result.error).toMatchObject({ code: 'rpc_error', method: 'tools/list' });
    });

    it.each([
        ['JSON that is not JSON-RPC', '{"not":"jsonrpc"}'],
        ['a body that is not JSON', '{not json']
    ])('reports %s as an invalid response', async (_label, body) => {
        mcpServer(() => response({ body }));

        const { result } = await list();

        expect(result.isErr() && result.error).toMatchObject({ code: 'invalid_response', method: 'tools/list' });
    });

    it('reports a response over the size limit as too large', async () => {
        mcpServer(() => response({ body: 'x'.repeat(5_000_001) }));

        const { result } = await list();

        expect(result.isErr() && result.error).toMatchObject({ code: 'response_too_large', message: 'The MCP server response exceeds the 5 MB limit' });
    });

    it('gives up on a server that never answers when the signal fires, and cancels the proxy request', async () => {
        let hungRequest: ProxyServiceRequest | undefined;
        mcpServer((_message, params) => {
            hungRequest = params;
            return new Promise((_resolve, reject) => params.abortSignal?.addEventListener('abort', () => reject(new Error('aborted'))));
        });

        const signal = AbortSignal.timeout(50);
        const { result } = await withRemoteMcpSession(TARGET, async (client) => await listRemoteTools(client, { maxTools: 3, signal }), { signal });

        expect(result.isErr() && result.error).toMatchObject({ code: 'timeout', method: 'tools/list' });
        expect(hungRequest?.abortSignal?.aborted).toBe(true);
    });

    it('carries a proxy failure through untouched', async () => {
        const failure = new ProxyServiceError({ code: 'connection_not_found', message: 'Connection not found', status: 404 });
        request.mockResolvedValue({ logCtx: undefined, result: Err(failure) });

        const { result } = await list();

        expect(result.isErr() && result.error.proxyError).toBe(failure);
    });
});
