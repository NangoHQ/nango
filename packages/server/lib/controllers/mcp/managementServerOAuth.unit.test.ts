import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { environmentService } from '@nangohq/shared';
import { Err, flags, metrics, Ok } from '@nangohq/utils';

import { audit, auditBackend } from '../../audit.js';
import { createIntegrationsTool } from './integrations/create.js';
import { listIntegrationsTool } from './integrations/list.js';
import { createManagementMcpServer } from './managementServer.js';
import { getProvidersTool } from './providers/get.js';

import type { McpServer } from '@modelcontextprotocol/server';
import type { Principal, ScopeSelector, WhereSelector } from '@nangohq/authz';
import type { AuditAttribution, DBEnvironment, DBTeam } from '@nangohq/types';
import type * as Utils from '@nangohq/utils';
import type { Mock } from 'vitest';

type LoadEnvironment = (id: number, accountId?: number | null) => Promise<DBEnvironment | null>;

// Audit entitlement modes are covered separately; keep this suite on the deployment opt-in path regardless of the shell environment.
vi.mock('@nangohq/utils', async (importOriginal) => {
    const actual = await importOriginal<typeof Utils>();
    return { ...actual, flagHasPlan: false };
});

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
            expect(client.getInstructions()).toBe(
                'Before using an environment-bound tool, always ask the user which Nango environment to use. Call environments_list first when you need to present the available choices. Use only the environment the user selects; do not query every environment unless the user explicitly asks you to.'
            );

            const result = await client.listTools();

            expect(result.tools.map((tool) => tool.name)).toStrictEqual(['environments_list', ...managementToolNames]);
            expect(result.tools[0]).toMatchObject({
                name: 'environments_list',
                description:
                    'List the Nango environments currently available to your user. Call this first, then ask the user to choose an environment before using environment-bound tools. Do not automatically query every returned environment.',
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
        const getEnvironmentsSpy = vi.spyOn(environmentService, 'getEnvironmentsByAccountId').mockResolvedValue(
            Ok([
                { id: 1, uuid: 'dev-environment', name: 'dev', is_production: false },
                { id: 2, uuid: 'prod-environment', name: 'prod', is_production: true }
            ])
        );
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
            expect(getEnvironmentsSpy).toHaveBeenCalledOnce();
            expect(getEnvironmentsSpy).toHaveBeenCalledWith(1);
            expect(loadEnvironment).not.toHaveBeenCalled();
        } finally {
            await client.close();
            await server.close();
        }
    });

    it('returns and records environment lookup failures through the standard tool error path', async () => {
        const error = new Error('failed to retrieve environments');
        vi.spyOn(environmentService, 'getEnvironmentsByAccountId').mockResolvedValue(Err(error));
        const metricSpy = vi.spyOn(metrics, 'increment');
        const { client, server } = await createTestClient();

        try {
            const result = await client.callTool({ name: 'environments_list', arguments: {} });

            expect(result).toMatchObject({ isError: true, content: [{ type: 'text', text: 'Internal error' }] });
            expect(metricSpy).toHaveBeenCalledWith(metrics.Types.MCP_TOOL_CALLS, 1, {
                accountId: 1,
                mcp_type: 'management',
                tool: 'environments_list',
                outcome: 'error'
            });
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
        const hydrateEnvironmentSpy = vi.spyOn(environmentService, 'getByEnvironmentName');
        const request = {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'providers_get', arguments: { environment: 'dev', provider: 'github', include_templates: true } }
        };
        const { client, server, loadEnvironment } = await createTestClient({ requestBody: request });

        try {
            const result = await client.callTool(request.params);

            expect(result).toStrictEqual({
                content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
                structuredContent: response
            });
            expect(handlerSpy).toHaveBeenCalledOnce();
            const call = handlerSpy.mock.calls[0];
            if (!call) throw new Error('Expected providers_get handler call');
            expect(call[0]).toStrictEqual({ provider: 'github', include_templates: true });
            expect(call[1].account.id).toBe(1);
            expect(call[1].environment).toMatchObject({
                id: 1,
                uuid: 'dev-environment',
                name: 'dev',
                account_id: 1,
                is_production: false,
                secret_key: '',
                pending_secret_key: null
            });
            expect(JSON.stringify(call[1].environment)).not.toContain('dev-secret');
            expect(call[1].plan).toBeNull();
            expect(call[1].grantedScopes).toContain('environment:integrations:read_credentials');
            expect(loadEnvironment).toHaveBeenCalledOnce();
            expect(loadEnvironment).toHaveBeenCalledWith(1, 1);
            expect(hydrateEnvironmentSpy).not.toHaveBeenCalled();
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

    it('returns an MCP error when loading the selected environment fails', async () => {
        const metricSpy = vi.spyOn(metrics, 'increment');
        const requestBody = {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'providers_get', arguments: { environment: 'dev', provider: 'github' } }
        };
        const { client, server, loadEnvironment } = await createTestClient({ loadEnvironmentError: new Error('Database unavailable'), requestBody });

        try {
            const result = await client.callTool({ name: 'providers_get', arguments: { environment: 'dev', provider: 'github' } });

            expect(result).toMatchObject({ isError: true, content: [{ type: 'text', text: 'Internal error' }] });
            expect(loadEnvironment).toHaveBeenCalledOnce();
            expect(loadEnvironment).toHaveBeenCalledWith(1, 1);
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

    it('allows a later tool call to retry a transient environment load failure', async () => {
        const response = {
            name: 'github',
            display_name: 'GitHub',
            auth_mode: 'OAUTH2' as const,
            docs: 'https://nango.dev/docs/api-integrations/github',
            logo_url: 'https://api.nango.dev/images/template-logos/github.svg',
            templates: []
        };
        const handlerSpy = vi.spyOn(getProvidersTool, 'handler').mockResolvedValueOnce(Ok(response));
        const loadEnvironment = vi
            .fn<LoadEnvironment>()
            .mockRejectedValueOnce(new Error('Transient database failure'))
            .mockResolvedValueOnce({ ...fakeEnvironment({ id: 1, name: 'dev', isProduction: false }), secret_key: '', pending_secret_key: null });
        const { client, server } = await createTestClient({ loadEnvironment });

        try {
            const firstResult = await client.callTool({ name: 'providers_get', arguments: { environment: 'dev', provider: 'github' } });
            const secondResult = await client.callTool({ name: 'providers_get', arguments: { environment: 'dev', provider: 'github' } });

            expect(firstResult).toMatchObject({ isError: true, content: [{ type: 'text', text: 'Internal error' }] });
            expect(secondResult).toStrictEqual({
                content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
                structuredContent: response
            });
            expect(loadEnvironment).toHaveBeenCalledTimes(2);
            expect(loadEnvironment).toHaveBeenNthCalledWith(1, 1, 1);
            expect(loadEnvironment).toHaveBeenNthCalledWith(2, 1, 1);
            expect(handlerSpy).toHaveBeenCalledOnce();
        } finally {
            await client.close();
            await server.close();
        }
    });

    it('audits an authorized invalid call that the MCP SDK rejects before dispatch', async () => {
        flags.hasAuditTrail = true;
        auditBackend.configured = true;
        const auditSpy = vi.spyOn(audit, 'record').mockResolvedValue(Ok(undefined));
        const { client, server, loadEnvironment } = await createTestClient({
            audit: {
                kind: 'request',
                actor: { type: 'user', id: '1', display: 'user@nango.dev' },
                context: { ip: '127.0.0.1', userAgent: 'test-client' }
            },
            requestBody: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: 'syncs_set_state', arguments: { environment: 'dev', integration_id: 42, state: 'paused' } }
            }
        });

        try {
            await vi.waitFor(() => expect(auditSpy).toHaveBeenCalledOnce());
            expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
                accountId: 1,
                environment: { id: 'dev-environment', display: 'dev' },
                resource: 'sync',
                action: 'paused',
                targets: [],
                outcome: 'failure'
            });
            expect(loadEnvironment).toHaveBeenCalledOnce();
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

    it('audits a mutation targeting a known environment outside the current user grants', async () => {
        flags.hasAuditTrail = true;
        auditBackend.configured = true;
        const auditSpy = vi.spyOn(audit, 'record').mockResolvedValue(Ok(undefined));
        const handlerSpy = vi.spyOn(createIntegrationsTool, 'handler');
        const args = {
            environment: 'prod',
            provider: 'github',
            integration_id: 'github',
            display_name: 'denied-secret-marker',
            forward_webhooks: true,
            credential_source: 'nango'
        };
        const { client, server, loadEnvironment } = await createTestClient({
            principal: principal(['environment:*'], ['env:non-production']),
            audit: {
                kind: 'request',
                actor: { type: 'user', id: '1', display: 'user@nango.dev' },
                context: { ip: '127.0.0.1', userAgent: 'test-client' }
            },
            requestBody: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: 'integrations_create', arguments: args }
            }
        });

        try {
            const result = await client.callTool({ name: 'integrations_create', arguments: args });

            expect(result).toMatchObject({ isError: true, content: [{ type: 'text', text: 'Environment not found or inaccessible' }] });
            await vi.waitFor(() => expect(auditSpy).toHaveBeenCalledOnce());
            const event = auditSpy.mock.calls[0]?.[0];
            expect(event).toMatchObject({
                accountId: 1,
                environment: { id: 'prod-environment', display: 'prod' },
                actor: { type: 'user', id: '1', display: 'user@nango.dev' },
                resource: 'integration',
                action: 'created',
                targets: [],
                context: { interface: 'mcp', ip: '127.0.0.1', userAgent: 'test-client' },
                outcome: 'denied'
            });
            expect(JSON.stringify(event)).not.toContain('denied-secret-marker');
            expect(loadEnvironment).not.toHaveBeenCalled();
            expect(handlerSpy).not.toHaveBeenCalled();
        } finally {
            await client.close();
            await server.close();
        }
    });
});

async function createTestClient({
    principal: userPrincipal = principal(['environment:*'], ['env:*']),
    audit: auditAttribution,
    loadEnvironment: loadEnvironmentOverride,
    loadEnvironmentError,
    requestBody
}: {
    principal?: Principal;
    audit?: AuditAttribution;
    loadEnvironment?: Mock<LoadEnvironment>;
    loadEnvironmentError?: Error;
    requestBody?: unknown;
} = {}): Promise<{
    client: Client;
    server: McpServer;
    loadEnvironment: Mock<LoadEnvironment>;
}> {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const environments = [fakeEnvironment({ id: 1, name: 'dev', isProduction: false }), fakeEnvironment({ id: 2, name: 'prod', isProduction: true })];
    const loadEnvironment =
        loadEnvironmentOverride ??
        (loadEnvironmentError
            ? vi.fn((_id: number, _accountId?: number | null) => Promise.reject(loadEnvironmentError))
            : vi.fn((id: number, accountId?: number | null) => {
                  const environment = accountId === 1 ? environments.find((candidate) => candidate.id === id) : undefined;
                  return Promise.resolve(environment ? { ...environment, secret_key: '', pending_secret_key: null } : null);
              }));
    vi.spyOn(environmentService, 'getByIdWithoutSecrets').mockImplementation(loadEnvironment);
    const server = await createManagementMcpServer(
        {
            type: 'oauth',
            context: {
                account: fakeAccount(),
                plan: null,
                principal: userPrincipal,
                environments: environments.map(({ id, uuid, name, account_id, is_production }) => ({ id, uuid, name, account_id, is_production })),
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
