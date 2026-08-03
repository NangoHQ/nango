import { request } from 'node:http';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { getGlobalWebhookReceiveUrl, seeders } from '@nangohq/shared';

import type { authenticateUser as authenticateUserType, runServer as runServerType } from '../../utils/tests.js';
import type { ApiKeyScope } from '@nangohq/types';

type AuthenticateUser = typeof authenticateUserType;
type RunServer = typeof runServerType;

let originalManagementMcpServerUrl: string | undefined;
let authenticateUser: AuthenticateUser;
let runServer: RunServer;
let api: Awaited<ReturnType<RunServer>>;

async function mcpFetch({
    token,
    method,
    body,
    host = 'mcp-development.nango.dev'
}: {
    token: string;
    method: 'GET' | 'POST';
    body?: Record<string, unknown>;
    host?: string;
}): Promise<{ status: number; json: any }> {
    const url = new URL('/mcp', api.url);
    const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Host: host
    };

    if (body) {
        headers['Accept'] = 'application/json, text/event-stream';
        headers['content-type'] = 'application/json';
    }

    return await new Promise((resolve, reject) => {
        const req = request(
            {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                method,
                headers
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
        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function mcpGet({ token, host = 'mcp-development.nango.dev' }: { token: string; host?: string }): Promise<{ status: number; json: any }> {
    return await mcpFetch({ token, method: 'GET', host });
}

async function mcpPost({
    token,
    body,
    host = 'mcp-development.nango.dev'
}: {
    token: string;
    body: Record<string, unknown>;
    host?: string;
}): Promise<{ status: number; json: any }> {
    return await mcpFetch({ token, method: 'POST', body, host });
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
        originalManagementMcpServerUrl = process.env['NANGO_MANAGEMENT_MCP_SERVER_URL'];
        process.env['NANGO_MANAGEMENT_MCP_SERVER_URL'] = 'https://mcp-development.nango.dev';

        vi.resetModules();
        ({ authenticateUser, runServer } = await import('../../utils/tests.js'));
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
        if (originalManagementMcpServerUrl === undefined) {
            delete process.env['NANGO_MANAGEMENT_MCP_SERVER_URL'];
        } else {
            process.env['NANGO_MANAGEMENT_MCP_SERVER_URL'] = originalManagementMcpServerUrl;
        }
    });

    it('lists all tools with environment:* scope', async () => {
        const { secret } = await createKeyWithScopes(['environment:*']);
        const res = await mcpPost({
            token: secret,
            body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
        });

        expect(res.status).toBe(200);
        expect(res.json.result.tools.map((tool: { name: string }) => tool.name)).toStrictEqual([
            'integrations_list',
            'integrations_get',
            'integrations_create',
            'logs_list_operations',
            'logs_get_operation'
        ]);
    });

    it('rejects each management tool when its required scope is missing', async () => {
        const { secret } = await createKeyWithScopes(['environment:mcp']);
        const toolNames = ['integrations_list', 'integrations_get', 'integrations_create', 'logs_list_operations', 'logs_get_operation'];

        for (const toolName of toolNames) {
            const res = await mcpPost({
                token: secret,
                body: {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'tools/call',
                    params: { name: toolName, arguments: {} }
                }
            });

            expect(res.status).toBe(200);
            expect(res.json.result).toStrictEqual({
                content: [{ type: 'text', text: `MCP error -32602: Tool ${toolName} disabled` }],
                isError: true
            });
        }
    });

    it('lists log tools with logs:read scope', async () => {
        const { secret } = await createKeyWithScopes(['environment:logs:read']);
        const res = await mcpPost({
            token: secret,
            body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
        });

        expect(res.status).toBe(200);
        expect(res.json.result.tools.map((tool: { name: string }) => tool.name)).toStrictEqual(['logs_list_operations', 'logs_get_operation']);
    });

    it('lists integration tools with integrations:list scope', async () => {
        const { secret } = await createKeyWithScopes(['environment:integrations:list']);
        const res = await mcpPost({
            token: secret,
            body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
        });

        expect(res.status).toBe(200);
        expect(res.json.result.tools.map((tool: { name: string }) => tool.name)).toStrictEqual(['integrations_list']);
    });

    it('lists the integration get tool with integrations:read scope', async () => {
        const { secret } = await createKeyWithScopes(['environment:integrations:read']);
        const res = await mcpPost({
            token: secret,
            body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
        });

        expect(res.status).toBe(200);
        expect(res.json.result.tools).toHaveLength(1);
        expect(res.json.result.tools[0]).toMatchObject({
            name: 'integrations_get',
            annotations: { readOnlyHint: true }
        });
    });

    it('lists the integration creation tool with integrations:create scope', async () => {
        const { secret } = await createKeyWithScopes(['environment:integrations:create']);
        const res = await mcpPost({
            token: secret,
            body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
        });

        expect(res.status).toBe(200);
        expect(res.json.result.tools.map((tool: { name: string }) => tool.name)).toStrictEqual(['integrations_create']);
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

    it('does not grant management tools with only the legacy mcp scope', async () => {
        const { secret } = await createKeyWithScopes(['environment:mcp']);
        const res = await mcpPost({
            token: secret,
            body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
        });

        expect(res.status).toBe(200);
        expect(res.json.result.tools).toStrictEqual([]);
    });

    it('does not intercept the existing public API MCP hosts', async () => {
        const { secret } = await createKeyWithScopes(['environment:logs:read']);
        const res = await mcpPost({
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

    it('lists integrations for the authenticated environment', async () => {
        const { secret, env } = await createKeyWithScopes(['environment:integrations:list']);
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'integrations_list',
                    arguments: {}
                }
            }
        });

        expect(res.status).toBe(200);
        const payload = parseToolText(res);
        expect(payload.data).toHaveLength(1);
        expect(payload.data[0]).toMatchObject({
            provider: 'github',
            unique_key: 'github',
            display_name: 'GitHub (User OAuth)',
            forward_webhooks: true
        });
    });

    it('gets an integration with read scope and omits unauthorized credentials', async () => {
        const { secret, env } = await createKeyWithScopes(['environment:integrations:read']);
        await seeders.createConfigSeed(env, 'github', 'github', { oauth_client_id: 'client-id', oauth_client_secret: 'client-secret' });

        const res = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'integrations_get',
                    arguments: { integration_id: 'github', include: ['credentials'] }
                }
            }
        });

        expect(res.status).toBe(200);
        const payload = parseToolText(res);
        expect(payload.data).toMatchObject({
            provider: 'github',
            unique_key: 'github',
            display_name: 'GitHub (User OAuth)',
            forward_webhooks: true
        });
        expect(payload.data).not.toHaveProperty('credentials');
    });

    it('gets requested includes with an integration wildcard scope', async () => {
        const { secret, env } = await createKeyWithScopes(['environment:integrations:*']);
        await seeders.createConfigSeed(env, 'platform-google', 'google', {
            oauth_client_id: 'client-id',
            oauth_client_secret: 'client-secret',
            oauth_scopes: 'openid,email'
        });

        const res = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'integrations_get',
                    arguments: { integration_id: 'platform-google', include: ['webhook', 'credentials'] }
                }
            }
        });

        expect(res.status).toBe(200);
        const payload = parseToolText(res);
        expect(payload.data).toMatchObject({
            provider: 'google',
            unique_key: 'platform-google',
            webhook_url: `${getGlobalWebhookReceiveUrl()}/${env.uuid}/platform-google`,
            credentials: {
                type: 'OAUTH2',
                client_id: 'client-id',
                client_secret: 'client-secret',
                scopes: 'openid,email',
                webhook_secret: null
            }
        });
        expect(res.json.result.structuredContent).toStrictEqual(payload);
    });

    it('rejects invalid integration get arguments', async () => {
        const { secret } = await createKeyWithScopes(['environment:integrations:read']);
        const res = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'integrations_get',
                    arguments: { integration_id: 'github', unexpected: true }
                }
            }
        });

        expect(res.status).toBe(200);
        expect(res.json.result).toMatchObject({
            content: [{ type: 'text', text: expect.stringContaining('Invalid arguments for tool integrations_get') }],
            isError: true
        });
    });

    it('returns public errors from the integration get tool', async () => {
        const { secret } = await createKeyWithScopes(['environment:integrations:read']);
        const res = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'integrations_get',
                    arguments: { integration_id: 'missing' }
                }
            }
        });

        expect(res.status).toBe(200);
        expect(res.json.result).toStrictEqual({
            content: [{ type: 'text', text: 'Integration "missing" does not exist' }],
            isError: true
        });
    });

    it('creates an integration for the authenticated environment', async () => {
        const { secret } = await createKeyWithScopes(['environment:integrations:create']);

        const res = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'integrations_create',
                    arguments: {
                        provider: 'algolia',
                        integration_id: 'algolia-mcp',
                        credential_source: 'own',
                        display_name: 'Algolia MCP',
                        forward_webhooks: false
                    }
                }
            }
        });

        expect(res.status).toBe(200);
        const payload = parseToolText(res);
        expect(payload).toMatchObject({
            data: {
                provider: 'algolia',
                unique_key: 'algolia-mcp',
                display_name: 'Algolia MCP',
                forward_webhooks: false
            }
        });
        expect(res.json.result.structuredContent).toStrictEqual(payload);
    });

    it('returns public integration creation errors', async () => {
        const { secret } = await createKeyWithScopes(['environment:integrations:create']);

        const res = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'integrations_create',
                    arguments: {
                        provider: 'unknown',
                        integration_id: 'unknown',
                        credential_source: 'own'
                    }
                }
            }
        });

        expect(res.status).toBe(200);
        expect(res.json.result).toStrictEqual({
            content: [{ type: 'text', text: 'Invalid provider' }],
            isError: true
        });
    });

    it('lists operations for the authenticated environment', async () => {
        const { secret, env, account } = await createKeyWithScopes(['environment:logs:read']);
        const logCtx = await logContextGetter.create({ operation: { type: 'auth', action: 'create_connection' } }, { account, environment: env });
        await logCtx.info('test info');
        await logCtx.success();

        const res = await mcpPost({
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

        const res = await mcpPost({
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

    it('gets an operation and its messages for the authenticated environment', async () => {
        const { secret, env, account } = await createKeyWithScopes(['environment:logs:read']);
        const logCtx = await logContextGetter.create({ operation: { type: 'proxy', action: 'call' } }, { account, environment: env });
        await logCtx.info('test info');
        await logCtx.success();

        const res = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'logs_get_operation',
                    arguments: {
                        operationId: logCtx.id,
                        messages: { limit: 10 }
                    }
                }
            }
        });

        expect(res.status).toBe(200);
        const payload = parseToolText(res);
        expect(payload.operation).toMatchObject({
            id: logCtx.id,
            accountId: account.id,
            environmentId: env.id,
            operation: { type: 'proxy', action: 'call' }
        });
        expect(payload.messages).toHaveLength(1);
        expect(payload.messages[0]).toMatchObject({
            parentId: logCtx.id,
            accountId: account.id,
            message: 'test info'
        });
        expect(payload.pagination).toMatchObject({ total: 1, cursor: expect.any(String) });
    });
});
