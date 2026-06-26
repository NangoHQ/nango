import { request } from 'node:http';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';

import type { authenticateUser as authenticateUserType, runServer as runServerType } from '../../utils/tests.js';
import type { ApiKeyScope } from '@nangohq/types';

type AuthenticateUser = typeof authenticateUserType;
type RunServer = typeof runServerType;

let originalControlPlaneMcpServerUrl: string | undefined;
let authenticateUser: AuthenticateUser;
let runServer: RunServer;
let api: Awaited<ReturnType<RunServer>>;

async function mcpFetch({
    token,
    body,
    host = 'mcp-development.nango.dev'
}: {
    token: string;
    body: Record<string, unknown>;
    host?: string;
}): Promise<{ status: number; json: any }> {
    const url = new URL('/mcp', api.url);

    return await new Promise((resolve, reject) => {
        const req = request(
            {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json, text/event-stream',
                    'content-type': 'application/json',
                    Host: host
                }
            },
            (res) => {
                let data = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    try {
                        resolve({ status: res.statusCode ?? 0, json: parseMcpResponse(data) });
                    } catch (err) {
                        reject(err);
                    }
                });
            }
        );
        req.on('error', reject);
        req.write(JSON.stringify(body));
        req.end();
    });
}

async function mcpGet({ token, host = 'mcp-development.nango.dev' }: { token: string; host?: string }): Promise<{ status: number; json: any }> {
    const url = new URL('/mcp', api.url);

    return await new Promise((resolve, reject) => {
        const req = request(
            {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    Host: host
                }
            },
            (res) => {
                let data = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    try {
                        resolve({ status: res.statusCode ?? 0, json: parseMcpResponse(data) });
                    } catch (err) {
                        reject(err);
                    }
                });
            }
        );
        req.on('error', reject);
        req.end();
    });
}

function parseMcpResponse(data: string): any {
    const trimmed = data.trim();
    if (!trimmed) {
        return {};
    }
    if (trimmed.startsWith('event:') || trimmed.startsWith('data:')) {
        return parseServerSentEventJson(trimmed);
    }

    return JSON.parse(trimmed);
}

function parseServerSentEventJson(data: string): any {
    for (const event of data.split(/\r?\n\r?\n/)) {
        const payload = event
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice('data:'.length).trimStart())
            .join('\n');

        if (payload) {
            return JSON.parse(payload);
        }
    }

    throw new Error('MCP SSE response did not contain a data payload');
}

async function createKeyWithScopes(scopes: ApiKeyScope[]) {
    const { env, account, user } = await seeders.seedAccountEnvAndUser();
    const session = await authenticateUser(api, user);
    const res = await api.fetch('/api/v1/environment/api-keys', {
        method: 'POST',
        // @ts-expect-error query params are required
        query: { env: env.name },
        body: { display_name: 'test', scopes },
        session
    });
    if ('error' in res.json) {
        throw new Error(`Failed to create API key: ${JSON.stringify(res.json.error)}`);
    }
    return { secret: res.json.data.secret, env, account };
}

function parseToolText(res: any) {
    return JSON.parse(res.json.result.content[0].text);
}

describe('POST /mcp control-plane server', () => {
    beforeAll(async () => {
        originalControlPlaneMcpServerUrl = process.env['NANGO_CONTROL_PLANE_MCP_SERVER_URL'];
        process.env['NANGO_CONTROL_PLANE_MCP_SERVER_URL'] = 'https://mcp-development.nango.dev';

        vi.resetModules();
        ({ authenticateUser, runServer } = await import('../../utils/tests.js'));
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
        if (originalControlPlaneMcpServerUrl === undefined) {
            delete process.env['NANGO_CONTROL_PLANE_MCP_SERVER_URL'];
        } else {
            process.env['NANGO_CONTROL_PLANE_MCP_SERVER_URL'] = originalControlPlaneMcpServerUrl;
        }
    });

    it('lists log tools with logs:read scope', async () => {
        const { secret } = await createKeyWithScopes(['environment:logs:read']);
        const res = await mcpFetch({
            token: secret,
            body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
        });

        expect(res.status).toBe(200);
        expect(res.json.result.tools.map((tool: { name: string }) => tool.name)).toStrictEqual(['logs_list_operations']);
    });

    it('returns the legacy MCP JSON-RPC error shape for GET requests', async () => {
        const { secret } = await createKeyWithScopes(['environment:logs:read']);
        const res = await mcpGet({ token: secret });

        expect(res.status).toBe(405);
        expect(res.json).toStrictEqual({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Method not allowed.'
            },
            id: null
        });
    });

    it('does not grant logs tools with only the legacy mcp scope', async () => {
        const { secret } = await createKeyWithScopes(['environment:mcp']);
        const res = await mcpFetch({
            token: secret,
            body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
        });

        expect(res.status).toBe(200);
        expect(res.json.result.tools).toStrictEqual([]);
    });

    it('does not intercept the existing public API MCP hosts', async () => {
        const { secret } = await createKeyWithScopes(['environment:logs:read']);
        const res = await mcpFetch({
            token: secret,
            host: 'api-development.nango.dev',
            body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
        });

        expect(res.status).toBe(403);
        expect(res.json.error).toMatchObject({
            code: 'forbidden',
            message: 'Insufficient scope. Required: environment:mcp'
        });
    });

    it('lists operations for the authenticated environment', async () => {
        const { secret, env, account } = await createKeyWithScopes(['environment:logs:read']);
        const logCtx = await logContextGetter.create({ operation: { type: 'auth', action: 'create_connection' } }, { account, environment: env });
        await logCtx.info('test info');
        await logCtx.success();

        const res = await mcpFetch({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'logs_list_operations',
                    arguments: {
                        limit: 10,
                        states: ['success'],
                        operations: [{ type: 'auth', actions: ['create_connection'] }]
                    }
                }
            }
        });

        expect(res.status).toBe(200);
        const payload = parseToolText(res);
        expect(payload.operations).toHaveLength(1);
        expect(payload.operations[0]).toMatchObject({
            id: logCtx.id,
            accountId: account.id,
            environmentId: env.id,
            state: 'success',
            operation: { type: 'auth', action: 'create_connection' }
        });
        expect(payload.pagination).toStrictEqual({ total: 1, cursor: null });
    });

    it('returns filtered pagination totals when searching operation messages', async () => {
        const { secret, env, account } = await createKeyWithScopes(['environment:logs:read']);
        const matchingLogCtx = await logContextGetter.create({ operation: { type: 'auth', action: 'create_connection' } }, { account, environment: env });
        await matchingLogCtx.info('needle message');
        await matchingLogCtx.success();

        const otherLogCtx = await logContextGetter.create({ operation: { type: 'auth', action: 'create_connection' } }, { account, environment: env });
        await otherLogCtx.info('unrelated message');
        await otherLogCtx.success();

        const res = await mcpFetch({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'logs_list_operations',
                    arguments: {
                        limit: 10,
                        search: 'needle'
                    }
                }
            }
        });

        expect(res.status).toBe(200);
        const payload = parseToolText(res);
        expect(payload.operations).toHaveLength(1);
        expect(payload.operations[0]).toMatchObject({ id: matchingLogCtx.id });
        expect(payload.operations.map((operation: { id: string }) => operation.id)).not.toContain(otherLogCtx.id);
        expect(payload.pagination).toStrictEqual({ total: 1, cursor: null });
    });
});
