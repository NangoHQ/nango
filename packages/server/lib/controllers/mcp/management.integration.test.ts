import { request } from 'node:http';
import { Readable } from 'node:stream';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import * as featureFlags from '@nangohq/feature-flags';
import { logContextGetter } from '@nangohq/logs';
import { getGlobalWebhookReceiveUrl, ProxyRequest, remoteFileService, seeders, syncManager } from '@nangohq/shared';
import { Ok } from '@nangohq/utils';

import { audit } from '../../audit.js';
import * as actionService from '../../services/action.service.js';
import { authenticateUser, runServer } from '../../utils/tests.js';
import { withoutUnscopedTools } from './testUtils.js';

import type { ApiKeyScope } from '@nangohq/types';
import type { InternalAxiosRequestConfig } from 'axios';
import type { MockInstance } from 'vitest';

let api: Awaited<ReturnType<typeof runServer>>;
let auditSpy: MockInstance<typeof audit.record>;

async function mcpFetch({
    token,
    method,
    body,
    host = 'mcp-test.nango.dev'
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

async function mcpGet({ token, host = 'mcp-test.nango.dev' }: { token: string; host?: string }): Promise<{ status: number; json: any }> {
    return await mcpFetch({ token, method: 'GET', host });
}

async function mcpPost({
    token,
    body,
    host = 'mcp-test.nango.dev'
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
    const { env, account, user } = await seeders.seedAccountEnvAndUser({ plan: { has_audit_trail_control_plane: true } });
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

describe('POST /mcp management server', () => {
    beforeAll(async () => {
        api = await runServer();
        auditSpy = vi.spyOn(audit, 'record').mockResolvedValue(Ok(undefined));
        vi.spyOn(featureFlags.getFlags(), 'isAuditTrailEnabled').mockResolvedValue(true);
    });

    afterAll(() => {
        api.server.close();
        vi.restoreAllMocks();
    });

    beforeEach(() => {
        auditSpy.mockClear();
    });

    it('lists all tools with environment:* scope', async () => {
        const { secret } = await createKeyWithScopes(['environment:*']);
        const res = await mcpPost({
            token: secret,
            body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
        });

        expect(res.status).toBe(200);
        expect(res.json.result.tools.map((tool: { name: string }) => tool.name)).toStrictEqual([
            'docs_search',
            'docs_query_filesystem',
            'providers_get',
            'connect_session_create',
            'integrations_list',
            'integrations_get',
            'integrations_create',
            'integrations_update',
            'integrations_delete',
            'connections_list',
            'connections_get',
            'syncs_set_state',
            'syncs_trigger',
            'actions_trigger',
            'proxy_request',
            'functions_list',
            'deploy_function',
            'deploy_template',
            'get_deployment_status',
            'logs_list_operations',
            'logs_get_operation'
        ]);
    });

    it('lists unscoped tools with the legacy mcp scope', async () => {
        const { secret } = await createKeyWithScopes(['environment:mcp']);
        const res = await mcpPost({
            token: secret,
            body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
        });

        expect(res.status).toBe(200);
        expect(res.json.result.tools.map((tool: { name: string }) => tool.name)).toStrictEqual(['docs_search', 'docs_query_filesystem', 'providers_get']);
    });

    it('gets a provider with templates without an additional operation scope', async () => {
        const { secret } = await createKeyWithScopes(['environment:mcp']);
        const res = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: 'providers_get', arguments: { provider: 'github', include_templates: true } }
            }
        });

        expect(res.status).toBe(200);
        expect(parseToolText(res)).toStrictEqual(res.json.result.structuredContent);
        expect(res.json.result.structuredContent).toMatchObject({
            name: 'github',
            display_name: 'GitHub (User OAuth)',
            auth_mode: 'OAUTH2',
            logo_url: expect.stringMatching('/images/template-logos/github.svg$')
        });
        expect(res.json.result.structuredContent.templates.length).toBeGreaterThan(0);
        expect(res.json.result.structuredContent.templates).toContainEqual(expect.objectContaining({ name: 'issues', type: 'sync' }));
    });

    it('returns public provider errors for invalid arguments and unknown providers', async () => {
        const { secret } = await createKeyWithScopes(['environment:mcp']);
        const invalid = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: 'providers_get', arguments: { provider: 'github', include_templates: 'true' } }
            }
        });

        expect(invalid.json.result).toMatchObject({ isError: true });
        expect(invalid.json.result.content[0].text).toContain('Invalid arguments for tool providers_get');

        const missing = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/call',
                params: { name: 'providers_get', arguments: { provider: 'missing' } }
            }
        });

        expect(missing.json.result).toStrictEqual({
            content: [{ type: 'text', text: 'Unknown provider missing' }],
            isError: true
        });
    });

    it('rejects each management tool when its required scope is missing', async () => {
        const { secret } = await createKeyWithScopes(['environment:mcp']);
        const toolNames = [
            'connect_session_create',
            'integrations_list',
            'integrations_get',
            'integrations_create',
            'integrations_update',
            'integrations_delete',
            'connections_list',
            'connections_get',
            'syncs_set_state',
            'syncs_trigger',
            'actions_trigger',
            'proxy_request',
            'functions_list',
            'deploy_function',
            'deploy_template',
            'get_deployment_status',
            'logs_list_operations',
            'logs_get_operation'
        ];

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

    it('triggers an action for the authenticated environment', async () => {
        const { secret, env, account } = await createKeyWithScopes(['environment:actions:execute']);
        const response = { issue_id: 'issue-123', created: true };
        const executeActionSpy = vi.spyOn(actionService, 'executeAction').mockResolvedValue({ logCtx: undefined, result: Ok({ data: response }) });

        try {
            const res = await mcpPost({
                token: secret,
                body: {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'tools/call',
                    params: {
                        name: 'actions_trigger',
                        arguments: {
                            action_name: 'create-issue',
                            input: { title: 'MCP support' },
                            integration_id: 'github',
                            connection_id: 'connection-id'
                        }
                    }
                }
            });

            expect(res.status).toBe(200);
            expect(parseToolText(res)).toStrictEqual({ data: response });
            expect(res.json.result.structuredContent).toStrictEqual({ data: response });
            expect(executeActionSpy).toHaveBeenCalledOnce();
            expect(executeActionSpy.mock.calls[0]?.[0]).toMatchObject({
                account,
                environment: env,
                connectionId: 'connection-id',
                providerConfigKey: 'github',
                actionName: 'create-issue',
                input: { title: 'MCP support' },
                isAsync: false,
                retryMax: 0
            });
            expect(executeActionSpy.mock.calls[0]?.[0].span).toBeDefined();
        } finally {
            executeActionSpy.mockRestore();
        }
    });

    it('audits a denied mutation from the parsed MCP request without reading its arguments', async () => {
        const { secret, env, account } = await createKeyWithScopes(['environment:mcp']);
        const credentialSecret = 'credential-secret-value';

        const res = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'integrations_create',
                    arguments: {
                        provider: 'github',
                        credentials: { client_secret: credentialSecret }
                    }
                }
            }
        });

        expect(res.status).toBe(200);
        expect(res.json.result).toStrictEqual({
            content: [{ type: 'text', text: 'MCP error -32602: Tool integrations_create disabled' }],
            isError: true
        });

        await vi.waitFor(() => {
            const event = auditSpy.mock.calls
                .map((call) => call[0])
                .find((candidate) => candidate.accountId === account.id && candidate.resource === 'integration' && candidate.action === 'created');
            expect(event).toMatchObject({
                accountId: account.id,
                environment: { id: env.uuid, display: env.name },
                actor: { type: 'api_key', id: expect.any(String) },
                resource: 'integration',
                action: 'created',
                targets: [],
                context: { interface: 'mcp' },
                outcome: 'denied'
            });
            expect(JSON.stringify(event)).not.toContain(credentialSecret);
        });
    });

    it('lists log tools with logs:read scope', async () => {
        const { secret } = await createKeyWithScopes(['environment:logs:read']);
        const res = await mcpPost({
            token: secret,
            body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
        });

        expect(res.status).toBe(200);
        expect(withoutUnscopedTools(res.json.result.tools).map((tool: { name: string }) => tool.name)).toStrictEqual([
            'logs_list_operations',
            'logs_get_operation'
        ]);
    });

    it('lists integration tools with integrations:list scope', async () => {
        const { secret } = await createKeyWithScopes(['environment:integrations:list']);
        const res = await mcpPost({
            token: secret,
            body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
        });

        expect(res.status).toBe(200);
        expect(withoutUnscopedTools(res.json.result.tools).map((tool: { name: string }) => tool.name)).toStrictEqual(['integrations_list']);
    });

    it('lists the functions tool with functions:list scope', async () => {
        const { secret } = await createKeyWithScopes(['environment:functions:list']);
        const res = await mcpPost({
            token: secret,
            body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
        });

        expect(res.status).toBe(200);
        const scopedTools = withoutUnscopedTools(res.json.result.tools);
        expect(scopedTools).toHaveLength(1);
        expect(scopedTools[0]).toMatchObject({
            name: 'functions_list',
            annotations: { readOnlyHint: true }
        });
    });

    it('lists filtered functions for an integration', async () => {
        const { secret, env } = await createKeyWithScopes(['environment:functions:list']);
        const integration = await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, provider: 'github' });
        if (!integration.id) {
            throw new Error('Integration seed has no ID');
        }
        await seeders.createSyncSeeds({
            connectionId: connection.id,
            environment_id: env.id,
            nango_config_id: integration.id,
            sync_name: 'create-issue',
            type: 'action'
        });
        await seeders.createSyncSeeds({
            connectionId: connection.id,
            environment_id: env.id,
            nango_config_id: integration.id,
            sync_name: 'sync-issues',
            type: 'sync'
        });
        await seeders.createSyncSeeds({
            connectionId: connection.id,
            environment_id: env.id,
            nango_config_id: integration.id,
            sync_name: 'create-user',
            type: 'action'
        });

        const res = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'functions_list',
                    arguments: { integration_id: 'github', type: 'action', search: 'issue', page: 0, limit: 1 }
                }
            }
        });

        expect(res.status).toBe(200);
        expect(parseToolText(res)).toStrictEqual(res.json.result.structuredContent);
        expect(res.json.result.structuredContent.pagination).toStrictEqual({ total: 1, page: 0, limit: 1 });
        expect(res.json.result.structuredContent.data).toHaveLength(1);
        expect(res.json.result.structuredContent.data[0]).toMatchObject({ name: 'create-issue', type: 'action' });
    });

    it('returns public errors for invalid function arguments and missing integrations', async () => {
        const { secret } = await createKeyWithScopes(['environment:functions:list']);

        const invalid = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: 'functions_list', arguments: { integration_id: 'github', limit: 0 } }
            }
        });
        expect(invalid.json.result).toMatchObject({ isError: true });
        expect(invalid.json.result.content[0].text).toContain('Invalid arguments for tool functions_list');

        const missing = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/call',
                params: { name: 'functions_list', arguments: { integration_id: 'missing' } }
            }
        });
        expect(missing.json.result).toStrictEqual({
            content: [{ type: 'text', text: 'Integration does not exist' }],
            isError: true
        });
    });

    it('lists separate deployment and status tools with deploy scope', async () => {
        const { secret } = await createKeyWithScopes(['environment:deploy']);
        const res = await mcpPost({
            token: secret,
            body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
        });

        expect(res.status).toBe(200);
        expect(withoutUnscopedTools(res.json.result.tools)).toMatchObject([
            {
                name: 'deploy_function',
                annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
            },
            {
                name: 'deploy_template',
                annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
            },
            {
                name: 'get_deployment_status',
                annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
            }
        ]);
    });

    it('deploys a function template and retrieves its completed deployment', async () => {
        vi.spyOn(remoteFileService, 'copy').mockResolvedValue('_LOCAL_FILE_');
        const { secret, env, account } = await createKeyWithScopes(['environment:deploy']);
        await seeders.createConfigSeed(env, 'airtable', 'airtable');

        const res = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: 'deploy_template', arguments: { integration_id: 'airtable', template: 'tables' } }
            }
        });

        expect(res.status).toBe(200);
        expect(parseToolText(res)).toStrictEqual(res.json.result.structuredContent);
        expect(res.json.result.structuredContent).toStrictEqual({
            id: expect.any(String),
            status: 'success',
            created_at: expect.any(String)
        });

        const status = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/call',
                params: { name: 'get_deployment_status', arguments: { id: res.json.result.structuredContent.id } }
            }
        });
        expect(parseToolText(status)).toStrictEqual(status.json.result.structuredContent);
        expect(status.json.result.structuredContent).toMatchObject({
            id: res.json.result.structuredContent.id,
            status: 'success',
            integration_id: 'airtable',
            function_name: 'tables',
            function_type: 'sync'
        });

        await vi.waitFor(() => {
            const event = auditSpy.mock.calls
                .map((call) => call[0])
                .find((candidate) => candidate.accountId === account.id && candidate.resource === 'function' && candidate.action === 'deployed');
            expect(event).toMatchObject({
                accountId: account.id,
                environment: { id: env.uuid, display: env.name },
                resource: 'function',
                action: 'deployed',
                targets: [{ type: 'function', id: 'tables' }],
                metadata: { providerConfigKey: 'airtable' },
                context: { interface: 'mcp' },
                outcome: 'success'
            });
        });
    });

    it('returns public errors for invalid deployment arguments and missing integrations', async () => {
        const { secret } = await createKeyWithScopes(['environment:deploy']);

        const invalid = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'deploy_template',
                    arguments: { integration_id: 'airtable', template: 'tables', code: 'not allowed' }
                }
            }
        });
        expect(invalid.json.result).toMatchObject({ isError: true });
        expect(invalid.json.result.content[0].text).toContain('Invalid arguments for tool deploy_template');

        const missing = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/call',
                params: {
                    name: 'deploy_function',
                    arguments: {
                        integration_id: 'missing',
                        function_name: 'sync-issues',
                        function_type: 'sync',
                        code: 'export default {}'
                    }
                }
            }
        });
        expect(missing.json.result).toStrictEqual({
            content: [{ type: 'text', text: "Integration 'missing' was not found" }],
            isError: true
        });

        const missingStatus = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 3,
                method: 'tools/call',
                params: { name: 'get_deployment_status', arguments: { id: '3c66291f-6247-47a6-a100-f4d621d751f7' } }
            }
        });
        expect(missingStatus.json.result).toStrictEqual({
            content: [{ type: 'text', text: "Deployment '3c66291f-6247-47a6-a100-f4d621d751f7' was not found" }],
            isError: true
        });
    });

    it('lists and executes the sync state tool', async () => {
        const { secret, env, account } = await createKeyWithScopes(['environment:syncs:execute']);
        const runSyncCommandSpy = vi.spyOn(syncManager, 'runSyncCommand').mockResolvedValue({ success: true, response: true, error: null });

        try {
            const listed = await mcpPost({
                token: secret,
                body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
            });
            expect(withoutUnscopedTools(listed.json.result.tools).map((tool: { name: string }) => tool.name)).toStrictEqual([
                'syncs_set_state',
                'syncs_trigger'
            ]);

            const syncs = ['issues', { name: 'users', variant: 'incremental' }];
            for (const [id, state] of ['started', 'paused'].entries()) {
                const res = await mcpPost({
                    token: secret,
                    body: {
                        jsonrpc: '2.0',
                        id: id + 2,
                        method: 'tools/call',
                        params: { name: 'syncs_set_state', arguments: { integration_id: 'github', connection_id: 'connection-id', syncs, state } }
                    }
                });

                expect(res.status).toBe(200);
                expect(parseToolText(res)).toStrictEqual({ success: true });
                expect(res.json.result.structuredContent).toStrictEqual({ success: true });
            }

            expect(runSyncCommandSpy).toHaveBeenNthCalledWith(
                1,
                expect.objectContaining({
                    environment: env,
                    providerConfigKey: 'github',
                    connectionId: 'connection-id',
                    syncIdentifiers: [
                        { syncName: 'issues', syncVariant: 'base' },
                        { syncName: 'users', syncVariant: 'incremental' }
                    ],
                    command: 'UNPAUSE',
                    initiator: 'MCP call'
                })
            );
            expect(runSyncCommandSpy).toHaveBeenNthCalledWith(2, expect.objectContaining({ command: 'PAUSE', initiator: 'MCP call' }));

            await vi.waitFor(() => {
                const events = auditSpy.mock.calls
                    .map((call) => call[0])
                    .filter((event) => event.accountId === account.id && event.resource === 'sync' && event.context.interface === 'mcp');
                expect(events).toHaveLength(2);
                expect(events).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({ action: 'started', outcome: 'success' }),
                        expect.objectContaining({ action: 'paused', outcome: 'success' })
                    ])
                );
                for (const event of events) {
                    expect(event).toMatchObject({
                        targets: [
                            { type: 'sync', id: 'issues' },
                            { type: 'sync', id: 'users::incremental' }
                        ],
                        metadata: { providerConfigKey: 'github', connectionId: 'connection-id' }
                    });
                }
            });
        } finally {
            runSyncCommandSpy.mockRestore();
        }
    });

    it('returns public errors for invalid sync arguments and missing integrations', async () => {
        const { secret, account } = await createKeyWithScopes(['environment:syncs:execute']);

        const invalid = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'syncs_set_state',
                    arguments: { integration_id: 'github', syncs: [{ name: 'issues' }], state: 'paused' }
                }
            }
        });
        expect(invalid.json.result).toMatchObject({ isError: true });
        expect(invalid.json.result.content[0].text).toContain('Invalid arguments for tool syncs_set_state');

        const missing = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/call',
                params: { name: 'syncs_set_state', arguments: { integration_id: 'missing', syncs: ['issues'], state: 'started' } }
            }
        });
        expect(missing.json.result).toStrictEqual({
            content: [{ type: 'text', text: 'Integration does not exist' }],
            isError: true
        });

        await vi.waitFor(() => {
            const events = auditSpy.mock.calls
                .map((call) => call[0])
                .filter((event) => event.accountId === account.id && event.resource === 'sync' && event.context.interface === 'mcp');
            expect(events).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ action: 'paused', outcome: 'failure', targets: [] }),
                    expect.objectContaining({
                        action: 'started',
                        outcome: 'failure',
                        targets: [],
                        metadata: { providerConfigKey: 'missing' }
                    })
                ])
            );
            expect(events).toHaveLength(2);
            expect(events.find((event) => event.action === 'paused')).not.toHaveProperty('metadata');
        });
    });

    it('executes and audits the sync trigger tool with reset and cache options', async () => {
        const { secret, env, account } = await createKeyWithScopes(['environment:syncs:execute']);
        const runSyncCommandSpy = vi.spyOn(syncManager, 'runSyncCommand').mockResolvedValue({ success: true, response: true, error: null });

        try {
            const res = await mcpPost({
                token: secret,
                body: {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'tools/call',
                    params: {
                        name: 'syncs_trigger',
                        arguments: {
                            integration_id: 'github',
                            connection_id: 'connection-id',
                            syncs: ['issues', { name: 'users', variant: 'incremental' }],
                            reset: true,
                            empty_cache: true
                        }
                    }
                }
            });

            expect(res.status).toBe(200);
            expect(parseToolText(res)).toStrictEqual({ success: true });
            expect(res.json.result.structuredContent).toStrictEqual({ success: true });
            expect(runSyncCommandSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    environment: env,
                    providerConfigKey: 'github',
                    connectionId: 'connection-id',
                    syncIdentifiers: [
                        { syncName: 'issues', syncVariant: 'base' },
                        { syncName: 'users', syncVariant: 'incremental' }
                    ],
                    command: 'RUN_FULL',
                    deleteRecords: true,
                    initiator: 'MCP call'
                })
            );

            await vi.waitFor(() => {
                expect(auditSpy).toHaveBeenCalledWith(
                    expect.objectContaining({
                        accountId: account.id,
                        resource: 'sync',
                        action: 'triggered',
                        outcome: 'success',
                        targets: [
                            { type: 'sync', id: 'issues' },
                            { type: 'sync', id: 'users::incremental' }
                        ],
                        metadata: {
                            providerConfigKey: 'github',
                            connectionId: 'connection-id',
                            reset: true,
                            emptyCache: true
                        }
                    })
                );
            });
        } finally {
            runSyncCommandSpy.mockRestore();
        }
    });

    it.each(['environment:connections:list', 'environment:connections:list_credentials'] as const)('lists the connections tool with %s', async (scope) => {
        const { secret } = await createKeyWithScopes([scope]);
        const res = await mcpPost({
            token: secret,
            body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
        });

        expect(res.status).toBe(200);
        const scopedTools = withoutUnscopedTools(res.json.result.tools);
        expect(scopedTools).toHaveLength(1);
        expect(scopedTools[0]).toMatchObject({
            name: 'connections_list',
            annotations: { readOnlyHint: true }
        });
    });

    it.each(['environment:connections:read', 'environment:connections:read_credentials'] as const)('lists the connection get tool with %s', async (scope) => {
        const { secret } = await createKeyWithScopes([scope]);
        const res = await mcpPost({
            token: secret,
            body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
        });

        expect(res.status).toBe(200);
        const scopedTools = withoutUnscopedTools(res.json.result.tools);
        expect(scopedTools).toHaveLength(1);
        expect(scopedTools[0]).toMatchObject({ name: 'connections_get', annotations: { readOnlyHint: false } });
    });

    it('gets a connection without credentials using the read scope', async () => {
        const { secret, env } = await createKeyWithScopes(['environment:connections:read']);
        await seeders.createConfigSeed(env, 'github', 'github');
        await seeders.createConnectionSeed({
            env,
            provider: 'github',
            connectionId: 'mcp-get-connection',
            rawCredentials: { type: 'API_KEY', apiKey: 'connection-secret' }
        });

        const res = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: 'connections_get', arguments: { connection_id: 'mcp-get-connection', integration_id: 'github' } }
            }
        });

        expect(res.status).toBe(200);
        expect(parseToolText(res)).toStrictEqual(res.json.result.structuredContent);
        expect(res.json.result.structuredContent).toMatchObject({
            connection_id: 'mcp-get-connection',
            provider_config_key: 'github',
            provider: 'github'
        });
        expect(res.json.result.structuredContent).not.toHaveProperty('credentials');
    });

    it('rejects credential and refresh options using only the read scope', async () => {
        const { secret, env } = await createKeyWithScopes(['environment:connections:read']);
        await seeders.createConfigSeed(env, 'github', 'github');
        await seeders.createConnectionSeed({
            env,
            provider: 'github',
            connectionId: 'mcp-get-no-refresh-permission',
            rawCredentials: { type: 'API_KEY', apiKey: 'connection-secret' }
        });

        const res = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'connections_get',
                    arguments: { connection_id: 'mcp-get-no-refresh-permission', integration_id: 'github', force_refresh: true }
                }
            }
        });

        expect(res.status).toBe(200);
        expect(res.json.result).toMatchObject({ isError: true });
        expect(res.json.result.content[0].text).toContain('environment:connections:read_credentials');
    });

    it('gets a connection with credentials using the credential-reading scope', async () => {
        const { secret, env } = await createKeyWithScopes(['environment:connections:read_credentials']);
        await seeders.createConfigSeed(env, 'github', 'github');
        await seeders.createConnectionSeed({
            env,
            provider: 'github',
            connectionId: 'mcp-get-connection-with-credentials',
            rawCredentials: { type: 'API_KEY', apiKey: 'connection-secret' }
        });

        const res = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'connections_get',
                    arguments: { connection_id: 'mcp-get-connection-with-credentials', integration_id: 'github' }
                }
            }
        });

        expect(res.status).toBe(200);
        expect(res.json.result.structuredContent.credentials).toStrictEqual({ type: 'API_KEY', apiKey: 'connection-secret' });
    });

    it('only returns provider refresh tokens when explicitly requested', async () => {
        const { secret, env } = await createKeyWithScopes(['environment:connections:read_credentials']);
        await seeders.createConfigSeed(env, 'workday-refresh-token', 'workday-refresh-token');
        await seeders.createConnectionSeed({
            env,
            provider: 'workday-refresh-token',
            connectionId: 'mcp-get-workday-connection',
            rawCredentials: {
                type: 'TWO_STEP',
                token: 'access-token',
                refreshToken: 'credential-refresh-secret',
                raw: { access_token: 'raw-access-token' }
            },
            connectionConfig: {
                userCredentials: {
                    type: 'OAUTH2',
                    access_token: 'user-access-token',
                    refresh_token: 'config-refresh-secret',
                    raw: {}
                }
            }
        });

        const redacted = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'connections_get',
                    arguments: { connection_id: 'mcp-get-workday-connection', integration_id: 'workday-refresh-token' }
                }
            }
        });

        expect(redacted.status).toBe(200);
        expect(redacted.json.result.structuredContent.credentials).toStrictEqual({
            type: 'TWO_STEP',
            token: 'access-token',
            raw: { access_token: 'raw-access-token' }
        });
        expect(redacted.json.result.structuredContent.connection_config).toStrictEqual({
            userCredentials: { type: 'OAUTH2', access_token: 'user-access-token', raw: {} }
        });

        const withRefreshTokens = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/call',
                params: {
                    name: 'connections_get',
                    arguments: {
                        connection_id: 'mcp-get-workday-connection',
                        integration_id: 'workday-refresh-token',
                        refresh_token: true
                    }
                }
            }
        });

        expect(withRefreshTokens.status).toBe(200);
        expect(withRefreshTokens.json.result.structuredContent.credentials).toMatchObject({
            refreshToken: 'credential-refresh-secret'
        });
        expect(withRefreshTokens.json.result.structuredContent.connection_config).toMatchObject({
            userCredentials: { refresh_token: 'config-refresh-secret' }
        });
    });

    it('returns public errors for invalid connection get arguments and missing connections', async () => {
        const { secret, env } = await createKeyWithScopes(['environment:connections:read']);
        await seeders.createConfigSeed(env, 'github', 'github');

        const invalid = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: 'connections_get', arguments: { connection_id: 'missing-integration-id' } }
            }
        });
        expect(invalid.json.result).toMatchObject({ isError: true });
        expect(invalid.json.result.content[0].text).toContain('Invalid arguments for tool connections_get');

        const missing = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/call',
                params: { name: 'connections_get', arguments: { connection_id: 'missing', integration_id: 'github' } }
            }
        });
        expect(missing.json.result).toStrictEqual({ content: [{ type: 'text', text: 'Failed to find connection' }], isError: true });
    });

    it('lists filtered connections without credentials using the list scope', async () => {
        const { secret, env } = await createKeyWithScopes(['environment:connections:list']);
        await seeders.createConfigSeed(env, 'github', 'github');
        await seeders.createConnectionSeed({
            env,
            provider: 'github',
            connectionId: 'mcp-list-connection',
            rawCredentials: { type: 'API_KEY', apiKey: 'connection-secret' }
        });

        const res = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: 'connections_list', arguments: { connection_id: 'mcp-list-connection', integration_id: 'github' } }
            }
        });

        expect(res.status).toBe(200);
        expect(parseToolText(res)).toStrictEqual(res.json.result.structuredContent);
        expect(res.json.result.structuredContent.connections).toHaveLength(1);
        expect(res.json.result.structuredContent.connections[0]).toMatchObject({
            connection_id: 'mcp-list-connection',
            provider_config_key: 'github',
            provider: 'github'
        });
        expect(res.json.result.structuredContent.connections[0]).not.toHaveProperty('credentials');
    });

    it('lists connections without credentials using the credential-list scope', async () => {
        const { secret, env } = await createKeyWithScopes(['environment:connections:list_credentials']);
        await seeders.createConfigSeed(env, 'github', 'github');
        await seeders.createConnectionSeed({
            env,
            provider: 'github',
            connectionId: 'mcp-list-connection-with-credentials',
            rawCredentials: { type: 'API_KEY', apiKey: 'connection-secret' }
        });

        const res = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: 'connections_list', arguments: { connection_id: 'mcp-list-connection-with-credentials' } }
            }
        });

        expect(res.status).toBe(200);
        expect(res.json.result.structuredContent.connections).toHaveLength(1);
        expect(res.json.result.structuredContent.connections[0]).not.toHaveProperty('credentials');
    });

    it('lists and executes the proxy tool with proxy scope', async () => {
        const { secret, env } = await createKeyWithScopes(['environment:proxy']);
        const integration = await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, config_id: integration.id!, provider: 'github' });
        const proxySpy = vi.spyOn(ProxyRequest.prototype, 'httpCall').mockResolvedValueOnce({
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json', 'x-request-id': 'proxy-request-id' },
            config: {} as InternalAxiosRequestConfig,
            data: Readable.from(['{"login":"octocat","provider_numeric_id":7584781588001541408}'])
        });

        try {
            const listed = await mcpPost({
                token: secret,
                body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
            });
            const scopedTools = withoutUnscopedTools(listed.json.result.tools);
            expect(scopedTools).toHaveLength(1);
            expect(scopedTools[0]).toMatchObject({
                name: 'proxy_request',
                annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
            });

            const res = await mcpPost({
                token: secret,
                body: {
                    jsonrpc: '2.0',
                    id: 2,
                    method: 'tools/call',
                    params: {
                        name: 'proxy_request',
                        arguments: {
                            method: 'GET',
                            path: '/users/octocat',
                            integration_id: integration.unique_key,
                            connection_id: connection.connection_id,
                            query_params: { page: 1 },
                            headers: { accept: 'application/json' }
                        }
                    }
                }
            });

            expect(res.status).toBe(200);
            expect(parseToolText(res)).toStrictEqual(res.json.result.structuredContent);
            expect(res.json.result.structuredContent).toStrictEqual({
                status: 200,
                headers: { 'content-type': 'application/json', 'x-request-id': 'proxy-request-id' },
                body: { login: 'octocat', provider_numeric_id: '7584781588001541408' }
            });
        } finally {
            proxySpy.mockRestore();
        }
    });

    it('rejects invalid proxy arguments', async () => {
        const { secret } = await createKeyWithScopes(['environment:proxy']);
        const res = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'proxy_request',
                    arguments: { method: 'TRACE', path: 'users', integration_id: 'github', connection_id: 'connection-id' }
                }
            }
        });

        expect(res.status).toBe(200);
        expect(res.json.result).toMatchObject({
            content: [{ type: 'text', text: expect.stringContaining('Invalid arguments for tool proxy_request') }],
            isError: true
        });
    });

    it('returns public proxy errors', async () => {
        const { secret } = await createKeyWithScopes(['environment:proxy']);
        const res = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'proxy_request',
                    arguments: { method: 'GET', path: '/users', integration_id: 'missing', connection_id: 'connection-id' }
                }
            }
        });

        expect(res.status).toBe(200);
        expect(res.json.result).toStrictEqual({
            content: [
                {
                    type: 'text',
                    text: 'Provider config not found for the given provider config key. Please make sure the provider config exists in the Nango dashboard.'
                }
            ],
            isError: true
        });
    });

    it('lists the integration get tool with integrations:read scope', async () => {
        const { secret } = await createKeyWithScopes(['environment:integrations:read']);
        const res = await mcpPost({
            token: secret,
            body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
        });

        expect(res.status).toBe(200);
        const scopedTools = withoutUnscopedTools(res.json.result.tools);
        expect(scopedTools).toHaveLength(1);
        expect(scopedTools[0]).toMatchObject({
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
        expect(withoutUnscopedTools(res.json.result.tools).map((tool: { name: string }) => tool.name)).toStrictEqual(['integrations_create']);
    });

    it('lists and executes the integration update tool with integrations:update scope', async () => {
        const { secret, env } = await createKeyWithScopes(['environment:integrations:update']);
        await seeders.createConfigSeed(env, 'github', 'github');

        const listed = await mcpPost({
            token: secret,
            body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
        });
        expect(withoutUnscopedTools(listed.json.result.tools).map((tool: { name: string }) => tool.name)).toStrictEqual(['integrations_update']);

        const res = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/call',
                params: {
                    name: 'integrations_update',
                    arguments: { integration_id: 'github', new_integration_id: 'github-renamed', display_name: 'GitHub Renamed', forward_webhooks: false }
                }
            }
        });

        expect(res.status).toBe(200);
        const payload = parseToolText(res);
        expect(payload.data).toMatchObject({
            provider: 'github',
            unique_key: 'github-renamed',
            display_name: 'GitHub Renamed',
            forward_webhooks: false
        });
        expect(res.json.result.structuredContent).toStrictEqual(payload);
    });

    it('lists and executes the integration delete tool and persists the deletion', async () => {
        const { secret, env } = await createKeyWithScopes(['environment:integrations:delete', 'environment:integrations:read']);
        await seeders.createConfigSeed(env, 'github', 'github');

        const listed = await mcpPost({
            token: secret,
            body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
        });
        const deleteTool = listed.json.result.tools.find((tool: { name: string }) => tool.name === 'integrations_delete');
        expect(deleteTool).toMatchObject({
            name: 'integrations_delete',
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
        });

        const res = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/call',
                params: { name: 'integrations_delete', arguments: { integration_id: 'github' } }
            }
        });

        expect(res.status).toBe(200);
        expect(parseToolText(res)).toStrictEqual({ success: true });
        expect(res.json.result.structuredContent).toStrictEqual({ success: true });

        const getAfterDelete = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 3,
                method: 'tools/call',
                params: { name: 'integrations_get', arguments: { integration_id: 'github' } }
            }
        });

        expect(getAfterDelete.status).toBe(200);
        expect(getAfterDelete.json.result).toStrictEqual({
            content: [{ type: 'text', text: 'Integration "github" does not exist' }],
            isError: true
        });
    });

    it('rejects invalid integration delete arguments', async () => {
        const { secret } = await createKeyWithScopes(['environment:integrations:delete']);
        const res = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: 'integrations_delete', arguments: { integration_id: 'github', unexpected: true } }
            }
        });

        expect(res.status).toBe(200);
        expect(res.json.result).toMatchObject({
            content: [{ type: 'text', text: expect.stringContaining('Invalid arguments for tool integrations_delete') }],
            isError: true
        });
    });

    it('returns public errors from the integration delete tool', async () => {
        const { secret } = await createKeyWithScopes(['environment:integrations:delete']);
        const res = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: 'integrations_delete', arguments: { integration_id: 'missing' } }
            }
        });

        expect(res.status).toBe(200);
        expect(res.json.result).toStrictEqual({
            content: [{ type: 'text', text: 'Integration "missing" does not exist' }],
            isError: true
        });
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

    it('creates a Connect Session for the authenticated environment', async () => {
        const { secret } = await createKeyWithScopes(['environment:connect_sessions:write']);
        const res = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'connect_session_create',
                    arguments: { end_user: { id: 'mcp-end-user', email: 'mcp@example.com' } }
                }
            }
        });

        expect(res.status).toBe(200);
        const payload = parseToolText(res);
        expect(payload).toStrictEqual({
            token: expect.stringMatching(/^nango_connect_session_/),
            connect_link: expect.stringContaining('nango_connect_session_'),
            expires_at: expect.toBeIsoDate()
        });
        expect(res.json.result.structuredContent).toStrictEqual(payload);
    });

    it('returns public Connect Session creation errors', async () => {
        const { secret } = await createKeyWithScopes(['environment:connect_sessions:write']);
        const res = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'connect_session_create',
                    arguments: { end_user: { id: 'mcp-end-user' }, allowed_integrations: ['missing'] }
                }
            }
        });

        expect(res.status).toBe(200);
        expect(res.json.result).toStrictEqual({
            content: [{ type: 'text', text: 'Integrations do not exist: missing' }],
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

    it('audits an authorized mutation once and does not audit a read-only call', async () => {
        const { secret, env, account } = await createKeyWithScopes(['environment:*']);
        const integrationId = 'algolia-audit';

        const createRes = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'integrations_create',
                    arguments: {
                        provider: 'algolia',
                        integration_id: integrationId,
                        credential_source: 'own'
                    }
                }
            }
        });

        expect(createRes.status).toBe(200);

        const accountMcpAuditEvents = () =>
            auditSpy.mock.calls.map((call) => call[0]).filter((event) => event.accountId === account.id && event.context.interface === 'mcp');

        await vi.waitFor(() => {
            expect(accountMcpAuditEvents()).toHaveLength(1);
        });
        expect(accountMcpAuditEvents()[0]).toMatchObject({
            accountId: account.id,
            environment: { id: env.uuid, display: env.name },
            actor: { type: 'api_key', id: expect.any(String) },
            resource: 'integration',
            action: 'created',
            targets: [{ type: 'integration', id: integrationId }],
            context: { interface: 'mcp' },
            outcome: 'success',
            metadata: { provider: 'algolia' }
        });

        const listRes = await mcpPost({
            token: secret,
            body: {
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/call',
                params: { name: 'integrations_list', arguments: {} }
            }
        });

        expect(listRes.status).toBe(200);
        expect(accountMcpAuditEvents()).toHaveLength(1);
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
