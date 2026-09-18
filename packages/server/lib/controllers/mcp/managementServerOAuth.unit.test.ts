import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { flags, metrics, Ok } from '@nangohq/utils';

import { audit, auditBackend } from '../../audit.js';
import { listIntegrationsTool } from './integrations/list.js';
import { createManagementMcpServer } from './managementServer.js';
import { getProvidersTool } from './providers/get.js';

import type { McpServer } from '@modelcontextprotocol/server';
import type { Principal, ScopeSelector, WhereSelector } from '@nangohq/authz';
import type { AuditAttribution, DBEnvironment, DBTeam } from '@nangohq/types';

const managementToolNames = [
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
    'deploy_template',
    'get_deployment_status',
    'logs_list_operations',
    'logs_get_operation'
];

describe('createManagementMcpServer with OAuth', () => {
    afterEach(() => {
        flags.hasAuditTrail = false;
        auditBackend.configured = false;
        vi.restoreAllMocks();
    });

    it('exposes environments_list and every OAuth-supported environment-bound management tool', async () => {
        const { client, server, loadEnvironment } = await createTestClient();

        try {
            const result = await client.listTools();

            expect(result.tools.map((tool) => tool.name)).toStrictEqual(['environments_list', ...managementToolNames]);
            expect(result.tools[0]).toMatchObject({
                name: 'environments_list',
                annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
                inputSchema: {
                    type: 'object',
                    properties: {},
                    additionalProperties: false
                },
                outputSchema: {
                    type: 'object',
                    required: ['environments'],
                    additionalProperties: false
                }
            });

            for (const tool of result.tools.slice(1)) {
                expect(tool.inputSchema.properties?.['environment']).toMatchObject({
                    type: 'string',
                    minLength: 1
                });
                expect(tool.inputSchema.required).toContain('environment');
            }
            expect(loadEnvironment).not.toHaveBeenCalled();
        } finally {
            await client.close();
            await server.close();
        }
    });

    it('returns only environments visible through live RBAC without exposing environment credentials', async () => {
        const { client, server, loadEnvironment } = await createTestClient({
            principal: principal(['environment:settings:read'], ['env:non-production'])
        });

        try {
            const result = await client.callTool({ name: 'environments_list', arguments: {} });
            const expected = {
                environments: [{ name: 'dev', is_production: false }]
            };

            expect(result).toStrictEqual({
                content: [{ type: 'text', text: JSON.stringify(expected, null, 2) }],
                structuredContent: expected
            });
            expect(loadEnvironment).not.toHaveBeenCalled();
        } finally {
            await client.close();
            await server.close();
        }
    });

    it('keeps environments_list strict and separate from environment-bound tools', async () => {
        const { client, server } = await createTestClient();

        try {
            const result = await client.callTool({ name: 'environments_list', arguments: { environment: 'dev' } });
            expect(result.isError).toBe(true);
            expect(result.content[0]).toMatchObject({ type: 'text' });
            expect(result.content[0]?.type === 'text' ? result.content[0].text : '').toContain('Invalid arguments for tool environments_list');
        } finally {
            await client.close();
            await server.close();
        }
    });

    it('resolves the selected environment and invokes the existing handler without the wrapper argument', async () => {
        const response = {
            name: 'github',
            display_name: 'GitHub',
            auth_mode: 'OAUTH2' as const,
            docs: 'https://nango.dev/docs/api-integrations/github',
            logo_url: 'https://api.nango.dev/images/template-logos/github.svg',
            templates: []
        };
        const handlerSpy = vi.spyOn(getProvidersTool, 'handler').mockResolvedValueOnce(Ok(response));
        const { client, server, loadEnvironment } = await createTestClient();

        try {
            const result = await client.callTool({
                name: 'providers_get',
                arguments: { environment: 'dev', provider: 'github', include_templates: true }
            });

            expect(result).toStrictEqual({
                content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
                structuredContent: response
            });
            expect(handlerSpy).toHaveBeenCalledOnce();
            const call = handlerSpy.mock.calls[0];
            if (!call) throw new Error('Expected providers_get handler call');
            expect(call[0]).toStrictEqual({ provider: 'github', include_templates: true });
            expect(call[1].account.id).toBe(1);
            expect(call[1].environment).toMatchObject({ id: 1, name: 'dev', uuid: 'dev-environment' });
            expect(call[1].plan).toBeNull();
            expect(call[1].grantedScopes).toContain('environment:integrations:read_credentials');
            expect(loadEnvironment).toHaveBeenCalledOnce();
            expect(loadEnvironment).toHaveBeenCalledWith('dev');
        } finally {
            await client.close();
            await server.close();
        }
    });

    it('requires an environment on wrapped tools', async () => {
        const handlerSpy = vi.spyOn(getProvidersTool, 'handler');
        const { client, server } = await createTestClient();

        try {
            const result = await client.callTool({ name: 'providers_get', arguments: { provider: 'github' } });

            expect(result.isError).toBe(true);
            expect(handlerSpy).not.toHaveBeenCalled();
        } finally {
            await client.close();
            await server.close();
        }
    });

    it('does not allow a tool to select an environment outside the current user grants', async () => {
        const handlerSpy = vi.spyOn(getProvidersTool, 'handler');
        const metricSpy = vi.spyOn(metrics, 'increment');
        const { client, server, loadEnvironment } = await createTestClient({
            principal: principal(['environment:*'], ['env:non-production'])
        });

        try {
            const result = await client.callTool({ name: 'providers_get', arguments: { environment: 'prod', provider: 'github' } });

            expect(result).toMatchObject({ isError: true, content: [{ type: 'text', text: 'Environment not found or inaccessible' }] });
            expect(handlerSpy).not.toHaveBeenCalled();
            expect(loadEnvironment).not.toHaveBeenCalled();
            expect(metricSpy).toHaveBeenCalledWith(metrics.Types.MCP_TOOL_CALLS, 1, {
                accountId: 1,
                mcp_type: 'management',
                tool: 'providers_get',
                outcome: 'error'
            });
        } finally {
            await client.close();
            await server.close();
        }
    });

    it('enforces each existing tool scope in the selected environment', async () => {
        const handlerSpy = vi.spyOn(listIntegrationsTool, 'handler').mockResolvedValueOnce(Ok({ data: [] }));
        const metricSpy = vi.spyOn(metrics, 'increment');
        const { client, server } = await createTestClient({
            principal: principal(['environment:settings:read'], ['env:*'])
        });

        try {
            const result = await client.callTool({ name: 'integrations_list', arguments: { environment: 'dev' } });

            expect(result).toMatchObject({
                isError: true,
                content: [{ type: 'text', text: 'Insufficient permissions for this tool in the selected environment' }]
            });
            expect(handlerSpy).not.toHaveBeenCalled();
            expect(metricSpy).toHaveBeenCalledWith(metrics.Types.MCP_TOOL_CALLS, 1, {
                accountId: 1,
                mcp_type: 'management',
                tool: 'integrations_list',
                outcome: 'error'
            });
        } finally {
            await client.close();
            await server.close();
        }
    });

    it('audits a mutation denied by the current user grants in the selected environment', async () => {
        flags.hasAuditTrail = true;
        auditBackend.configured = true;
        const auditSpy = vi.spyOn(audit, 'record').mockResolvedValue(Ok(undefined));
        const { client, server } = await createTestClient({
            principal: principal(['environment:settings:read'], ['env:*']),
            audit: {
                kind: 'request',
                actor: { type: 'user', id: '1', display: 'user@nango.dev' },
                context: { ip: '127.0.0.1', userAgent: 'test-client' }
            },
            requestBody: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'integrations_create',
                    arguments: { environment: 'dev', credentials: { client_secret: 'credential-secret-value' } }
                }
            }
        });

        try {
            await vi.waitFor(() => expect(auditSpy).toHaveBeenCalledOnce());
            const event = auditSpy.mock.calls[0]?.[0];
            expect(event).toMatchObject({
                accountId: 1,
                environment: { id: 'dev-environment', display: 'dev' },
                actor: { type: 'user', id: '1', display: 'user@nango.dev' },
                resource: 'integration',
                action: 'created',
                targets: [],
                context: { interface: 'mcp', ip: '127.0.0.1', userAgent: 'test-client' },
                outcome: 'denied'
            });
            expect(JSON.stringify(event)).not.toContain('credential-secret-value');
        } finally {
            await client.close();
            await server.close();
        }
    });
});

async function createTestClient({
    principal: userPrincipal = principal(['environment:*'], ['env:*']),
    audit: auditAttribution,
    requestBody
}: { principal?: Principal; audit?: AuditAttribution; requestBody?: unknown } = {}): Promise<{
    client: Client;
    server: McpServer;
    loadEnvironment: ReturnType<typeof vi.fn>;
}> {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const environments = [fakeEnvironment({ id: 1, name: 'dev', isProduction: false }), fakeEnvironment({ id: 2, name: 'prod', isProduction: true })];
    const loadEnvironment = vi.fn((name: string) => Promise.resolve(environments.find((environment) => environment.name === name) ?? null));
    const server = await createManagementMcpServer(
        {
            type: 'oauth',
            context: {
                account: fakeAccount(),
                plan: null,
                principal: userPrincipal,
                environments: environments.map(({ id, uuid, name, account_id, is_production }) => ({ id, uuid, name, account_id, is_production })),
                loadEnvironment,
                audit: auditAttribution
            }
        },
        requestBody
    );
    const client = new Client({ name: 'test-client', version: '1.0.0' });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    return { client, server, loadEnvironment };
}

function principal(can: ScopeSelector[], where: WhereSelector[]): Principal {
    return {
        subject: { type: 'user', id: '1', display: 'user@nango.dev' },
        accountId: 1,
        grants: [{ can, where }]
    };
}

function fakeAccount(): DBTeam {
    const now = new Date();
    return {
        id: 1,
        name: 'Test Account',
        uuid: 'test-account',
        found_us: null,
        created_at: now,
        updated_at: now
    };
}

function fakeEnvironment({ id, name, isProduction }: { id: number; name: string; isProduction: boolean }): DBEnvironment {
    const now = new Date();
    return {
        id,
        uuid: `${name}-environment`,
        name,
        account_id: 1,
        secret_key: `${name}-secret`,
        public_key: `${name}-public`,
        callback_url: null,
        webhook_url: null,
        webhook_url_secondary: null,
        websockets_path: null,
        hmac_enabled: false,
        always_send_webhook: false,
        send_auth_webhook: false,
        hmac_key: null,
        pending_secret_key: null,
        slack_notifications: false,
        webhook_receive_url: null,
        otlp_settings: null,
        is_production: isProduction,
        deleted_at: null,
        deleted: false,
        created_at: now,
        updated_at: now
    };
}
