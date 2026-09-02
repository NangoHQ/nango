import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { envs as logsEnvs } from '@nangohq/logs';
import { Err, flags, Ok } from '@nangohq/utils';

import { audit } from '../../audit.js';
import { triggerActionTool } from './actions/trigger.js';
import { getConnectionsTool } from './connections/get.js';
import { listConnectionsTool } from './connections/list.js';
import { createConnectSessionTool } from './connectSessions/create.js';
import { deployFunctionTool } from './functions/deployFunction.js';
import { getDeploymentStatusTool } from './functions/getDeploymentStatus.js';
import { listFunctionsTool } from './functions/list.js';
import { createIntegrationsTool } from './integrations/create.js';
import { deleteIntegrationsTool } from './integrations/delete.js';
import { updateIntegrationsTool } from './integrations/update.js';
import { listLogOperationsTool } from './logs/listOperations.js';
import { createManagementMcpServer } from './managementServer.js';
import { getProvidersTool } from './providers/get.js';
import { proxyRequestTool } from './proxy/request.js';
import { setSyncsStateTool } from './syncs/setState.js';
import { triggerSyncsTool } from './syncs/trigger.js';
import { withoutUnscopedTools } from './testUtils.js';
import { PublicMcpError } from './utils.js';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DBEnvironment, DBTeam } from '@nangohq/types';

describe('createManagementMcpServer', () => {
    afterEach(() => {
        flags.hasAuditTrail = false;
        vi.restoreAllMocks();
    });

    it('exposes all management tools when the environment wildcard scope is granted', async () => {
        const { client, server } = await createTestClient(['environment:*']);

        try {
            const result = await client.listTools();

            expect(result.tools.map(({ name, annotations }) => ({ name, annotations }))).toStrictEqual([
                {
                    name: 'docs_search',
                    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
                },
                {
                    name: 'docs_query_filesystem',
                    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
                },
                { name: 'providers_get', annotations: { readOnlyHint: true, openWorldHint: false } },
                {
                    name: 'connect_session_create',
                    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
                },
                { name: 'integrations_list', annotations: { readOnlyHint: true } },
                { name: 'integrations_get', annotations: { readOnlyHint: true } },
                {
                    name: 'integrations_create',
                    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
                },
                {
                    name: 'integrations_update',
                    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
                },
                {
                    name: 'integrations_delete',
                    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
                },
                { name: 'connections_list', annotations: { readOnlyHint: true } },
                {
                    name: 'connections_get',
                    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
                },
                {
                    name: 'syncs_set_state',
                    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
                },
                {
                    name: 'syncs_trigger',
                    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
                },
                {
                    name: 'actions_trigger',
                    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
                },
                {
                    name: 'proxy_request',
                    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
                },
                { name: 'functions_list', annotations: { readOnlyHint: true } },
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
                },
                { name: 'logs_list_operations', annotations: { readOnlyHint: true } },
                { name: 'logs_get_operation', annotations: { readOnlyHint: true } }
            ]);
        } finally {
            await client.close();
            await server.close();
        }
    });

    it('exposes documentation and provider tools without an environment operation scope', async () => {
        const { client, server } = await createTestClient(['environment:mcp']);

        try {
            const result = await client.listTools();

            expect(result.tools.map((tool) => tool.name)).toStrictEqual(['docs_search', 'docs_query_filesystem', 'providers_get']);
        } finally {
            await client.close();
            await server.close();
        }
    });

    it('returns provider results as JSON text and structured content without an operation scope', async () => {
        const response = {
            name: 'github',
            display_name: 'GitHub',
            auth_mode: 'OAUTH2' as const,
            docs: 'https://nango.dev/docs/api-integrations/github',
            logo_url: 'https://api.nango.dev/images/template-logos/github.svg',
            templates: []
        };
        const handlerSpy = vi.spyOn(getProvidersTool, 'handler').mockResolvedValueOnce(Ok(response));
        const { client, server } = await createTestClient(['environment:mcp']);

        try {
            const listed = await client.listTools();
            const providerTool = listed.tools.find((tool) => tool.name === 'providers_get');
            expect(providerTool).toMatchObject({
                annotations: { readOnlyHint: true, openWorldHint: false },
                inputSchema: {
                    type: 'object',
                    required: ['provider'],
                    additionalProperties: false
                }
            });

            const result = await client.callTool({ name: 'providers_get', arguments: { provider: 'github', include_templates: true } });

            expect(result).toStrictEqual({
                content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
                structuredContent: response
            });
            expect(handlerSpy).toHaveBeenCalledOnce();
        } finally {
            handlerSpy.mockRestore();
            await client.close();
            await server.close();
        }
    });

    it('advertises tool schemas using the default MCP JSON Schema dialect', async () => {
        const { client, server } = await createTestClient(['environment:*']);

        try {
            const result = await client.listTools();

            for (const tool of result.tools) {
                expect(tool.inputSchema['$schema']).toBe('https://json-schema.org/draft/2020-12/schema');
                expect(tool.outputSchema?.['$schema']).toBe('https://json-schema.org/draft/2020-12/schema');
            }
        } finally {
            await client.close();
            await server.close();
        }
    });

    it('exposes and authorizes non-idempotent Connect Session creation', async () => {
        const authorized = await createTestClient(['environment:connect_sessions:write']);
        try {
            const result = await authorized.client.listTools();
            const scopedTools = withoutUnscopedTools(result.tools);
            expect(scopedTools).toHaveLength(1);
            expect(scopedTools[0]).toMatchObject({
                name: 'connect_session_create',
                annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
            });
        } finally {
            await authorized.client.close();
            await authorized.server.close();
        }

        const handlerSpy = vi.spyOn(createConnectSessionTool, 'handler');
        const unauthorized = await createTestClient(['environment:mcp']);
        try {
            const result = await unauthorized.client.callTool({ name: 'connect_session_create', arguments: { end_user: { id: 'end-user-id' } } });
            expect(result).toMatchObject({ isError: true });
            expect(handlerSpy).not.toHaveBeenCalled();
        } finally {
            handlerSpy.mockRestore();
            await unauthorized.client.close();
            await unauthorized.server.close();
        }
    });

    it('returns Connect Session creation results as JSON text and structured content', async () => {
        const response = {
            token: 'session-token',
            connect_link: 'https://connect.example.com/session-token',
            expires_at: '2026-01-01T00:30:00.000Z'
        };
        const handlerSpy = vi.spyOn(createConnectSessionTool, 'handler').mockResolvedValueOnce(Ok(response));
        const { client, server } = await createTestClient(['environment:connect_sessions:write']);

        try {
            const result = await client.callTool({ name: 'connect_session_create', arguments: { end_user: { id: 'end-user-id' } } });

            expect(result).toStrictEqual({
                content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
                structuredContent: response
            });
        } finally {
            handlerSpy.mockRestore();
            await client.close();
            await server.close();
        }
    });

    it('exposes the integrations list tool when its scope is granted', async () => {
        const { client, server } = await createTestClient(['environment:integrations:list']);

        try {
            const result = await client.listTools();

            expect(withoutUnscopedTools(result.tools).map((tool) => tool.name)).toStrictEqual(['integrations_list']);
        } finally {
            await client.close();
            await server.close();
        }
    });

    it.each(['environment:integrations:read', 'environment:integrations:read_credentials'])('exposes the integrations get tool with %s', async (scope) => {
        const { client, server } = await createTestClient([scope]);

        try {
            const result = await client.listTools();

            const scopedTools = withoutUnscopedTools(result.tools);
            expect(scopedTools).toHaveLength(1);
            expect(scopedTools[0]).toMatchObject({
                name: 'integrations_get',
                annotations: { readOnlyHint: true }
            });
        } finally {
            await client.close();
            await server.close();
        }
    });

    it('exposes the integration creation tool and its mutation annotations when its scope is granted', async () => {
        const { client, server } = await createTestClient(['environment:integrations:create']);

        try {
            const result = await client.listTools();

            const scopedTools = withoutUnscopedTools(result.tools);
            expect(scopedTools).toHaveLength(1);
            expect(scopedTools[0]).toMatchObject({
                name: 'integrations_create',
                inputSchema: {
                    type: 'object',
                    properties: {
                        provider: { type: 'string' },
                        integration_id: { type: 'string' },
                        credential_source: { type: 'string', enum: ['nango', 'own'] },
                        credentials: { description: 'Only applicable when credential_source is own.' },
                        integration_config: { description: 'Only applicable when credential_source is own.' }
                    },
                    required: ['provider', 'integration_id', 'credential_source'],
                    additionalProperties: false,
                    oneOf: [
                        {
                            properties: { credential_source: { const: 'nango' } },
                            not: {
                                anyOf: [{ required: ['credentials'] }, { required: ['integration_config'] }]
                            }
                        },
                        { properties: { credential_source: { const: 'own' } } }
                    ]
                },
                annotations: {
                    readOnlyHint: false,
                    destructiveHint: false,
                    idempotentHint: false,
                    openWorldHint: false
                }
            });
        } finally {
            await client.close();
            await server.close();
        }
    });

    it('recognizes wildcard scopes for integration tools', async () => {
        const { client, server } = await createTestClient(['environment:integrations:*']);

        try {
            const result = await client.listTools();

            expect(withoutUnscopedTools(result.tools).map((tool) => tool.name)).toStrictEqual([
                'integrations_list',
                'integrations_get',
                'integrations_create',
                'integrations_update',
                'integrations_delete'
            ]);
        } finally {
            await client.close();
            await server.close();
        }
    });

    it('exposes and authorizes the non-idempotent integration update tool', async () => {
        const authorized = await createTestClient(['environment:integrations:update']);
        try {
            const result = await authorized.client.listTools();
            const scopedTools = withoutUnscopedTools(result.tools);
            expect(scopedTools).toHaveLength(1);
            expect(scopedTools[0]).toMatchObject({
                name: 'integrations_update',
                annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
            });
        } finally {
            await authorized.client.close();
            await authorized.server.close();
        }

        const handlerSpy = vi.spyOn(updateIntegrationsTool, 'handler');
        const unauthorized = await createTestClient(['environment:mcp']);
        try {
            const result = await unauthorized.client.callTool({ name: 'integrations_update', arguments: { integration_id: 'github' } });
            expect(result).toMatchObject({ isError: true });
            expect(handlerSpy).not.toHaveBeenCalled();
        } finally {
            handlerSpy.mockRestore();
            await unauthorized.client.close();
            await unauthorized.server.close();
        }
    });

    it('exposes and authorizes the integration delete tool', async () => {
        const authorized = await createTestClient(['environment:integrations:delete']);
        try {
            const result = await authorized.client.listTools();
            const scopedTools = withoutUnscopedTools(result.tools);
            expect(scopedTools).toHaveLength(1);
            expect(scopedTools[0]).toMatchObject({
                name: 'integrations_delete',
                annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
            });
        } finally {
            await authorized.client.close();
            await authorized.server.close();
        }

        const handlerSpy = vi.spyOn(deleteIntegrationsTool, 'handler');
        const unauthorized = await createTestClient(['environment:mcp']);
        try {
            const result = await unauthorized.client.callTool({ name: 'integrations_delete', arguments: { integration_id: 'github' } });
            expect(result).toMatchObject({ isError: true });
            expect(handlerSpy).not.toHaveBeenCalled();
        } finally {
            handlerSpy.mockRestore();
            await unauthorized.client.close();
            await unauthorized.server.close();
        }
    });

    it.each(['environment:connections:list', 'environment:connections:list_credentials'])(
        'exposes the read-only connections list tool with %s',
        async (scope) => {
            const { client, server } = await createTestClient([scope]);

            try {
                const result = await client.listTools();

                const scopedTools = withoutUnscopedTools(result.tools);
                expect(scopedTools).toHaveLength(1);
                expect(scopedTools[0]).toMatchObject({
                    name: 'connections_list',
                    annotations: { readOnlyHint: true }
                });
            } finally {
                await client.close();
                await server.close();
            }
        }
    );

    it('exposes and authorizes the open-world proxy tool', async () => {
        const authorized = await createTestClient(['environment:proxy']);
        try {
            const result = await authorized.client.listTools();
            const scopedTools = withoutUnscopedTools(result.tools);
            expect(scopedTools).toHaveLength(1);
            expect(scopedTools[0]).toMatchObject({
                name: 'proxy_request',
                annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
            });
        } finally {
            await authorized.client.close();
            await authorized.server.close();
        }

        const handlerSpy = vi.spyOn(proxyRequestTool, 'handler');
        const unauthorized = await createTestClient(['environment:mcp']);
        try {
            const result = await unauthorized.client.callTool({
                name: 'proxy_request',
                arguments: { method: 'GET', path: '/user', integration_id: 'github', connection_id: 'connection-id' }
            });
            expect(result).toMatchObject({ isError: true });
            expect(handlerSpy).not.toHaveBeenCalled();
        } finally {
            handlerSpy.mockRestore();
            await unauthorized.client.close();
            await unauthorized.server.close();
        }
    });

    it('recognizes the connections wildcard scope', async () => {
        const { client, server } = await createTestClient(['environment:connections:*']);

        try {
            const result = await client.listTools();

            expect(withoutUnscopedTools(result.tools).map((tool) => tool.name)).toStrictEqual(['connections_list', 'connections_get']);
        } finally {
            await client.close();
            await server.close();
        }
    });

    it('exposes and authorizes non-idempotent action triggering', async () => {
        const authorized = await createTestClient(['environment:actions:execute']);
        try {
            const result = await authorized.client.listTools();
            const scopedTools = withoutUnscopedTools(result.tools);
            expect(scopedTools).toHaveLength(1);
            expect(scopedTools[0]).toMatchObject({
                name: 'actions_trigger',
                description: expect.stringContaining('time out within 90 seconds'),
                inputSchema: {
                    type: 'object',
                    required: ['action_name', 'integration_id', 'connection_id'],
                    additionalProperties: false
                },
                outputSchema: { type: 'object', required: ['data'], additionalProperties: false },
                annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
            });
            expect(scopedTools[0]?.inputSchema.properties).not.toHaveProperty('async');
            expect(scopedTools[0]?.inputSchema.properties).not.toHaveProperty('max_retries');
        } finally {
            await authorized.client.close();
            await authorized.server.close();
        }

        const handlerSpy = vi.spyOn(triggerActionTool, 'handler');
        const unauthorized = await createTestClient(['environment:mcp']);
        try {
            const result = await unauthorized.client.callTool({
                name: 'actions_trigger',
                arguments: { action_name: 'create-issue', input: {}, integration_id: 'github', connection_id: 'connection-id' }
            });

            expect(result).toStrictEqual({
                content: [{ type: 'text', text: 'MCP error -32602: Tool actions_trigger disabled' }],
                isError: true
            });
            expect(handlerSpy).not.toHaveBeenCalled();
        } finally {
            handlerSpy.mockRestore();
            await unauthorized.client.close();
            await unauthorized.server.close();
        }
    });

    it('returns action responses as JSON text and structured content', async () => {
        const response = { data: 'created' };
        const handlerSpy = vi.spyOn(triggerActionTool, 'handler').mockResolvedValueOnce(Ok(response));
        const { client, server } = await createTestClient(['environment:actions:execute']);

        try {
            const result = await client.callTool({
                name: 'actions_trigger',
                arguments: { action_name: 'create-issue', input: {}, integration_id: 'github', connection_id: 'connection-id' }
            });

            expect(result).toStrictEqual({
                content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
                structuredContent: response
            });
            expect(handlerSpy).toHaveBeenCalledOnce();
        } finally {
            handlerSpy.mockRestore();
            await client.close();
            await server.close();
        }
    });

    it.each(['environment:connections:read', 'environment:connections:read_credentials'])('exposes the connections get tool with %s', async (scope) => {
        const { client, server } = await createTestClient([scope]);

        try {
            const result = await client.listTools();

            const scopedTools = withoutUnscopedTools(result.tools);
            expect(scopedTools).toHaveLength(1);
            expect(scopedTools[0]).toMatchObject({
                name: 'connections_get',
                annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
            });
        } finally {
            await client.close();
            await server.close();
        }
    });

    it('authorizes connection retrieval before invoking the tool', async () => {
        const handlerSpy = vi.spyOn(getConnectionsTool, 'handler');
        const { client, server } = await createTestClient(['environment:mcp']);

        try {
            const result = await client.callTool({ name: 'connections_get', arguments: { connection_id: 'connection-id', integration_id: 'github' } });

            expect(result).toMatchObject({ isError: true });
            expect(handlerSpy).not.toHaveBeenCalled();
        } finally {
            handlerSpy.mockRestore();
            await client.close();
            await server.close();
        }
    });

    it('returns connections as JSON text and structured content', async () => {
        const response = {
            id: 1,
            connection_id: 'connection-id',
            provider_config_key: 'github',
            provider: 'github',
            connection_config: {},
            webhook_url_override: null,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-02T00:00:00.000Z',
            last_fetched_at: '2026-01-03T00:00:00.000Z',
            metadata: null,
            tags: {},
            errors: [],
            end_user: null
        };
        const handlerSpy = vi.spyOn(getConnectionsTool, 'handler').mockResolvedValueOnce(Ok(response));
        const { client, server } = await createTestClient(['environment:connections:read']);

        try {
            const result = await client.callTool({
                name: 'connections_get',
                arguments: { connection_id: 'connection-id', integration_id: 'github' }
            });

            expect(result).toStrictEqual({
                content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
                structuredContent: response
            });
        } finally {
            handlerSpy.mockRestore();
            await client.close();
            await server.close();
        }
    });

    it('authorizes connection listing before invoking the tool', async () => {
        const handlerSpy = vi.spyOn(listConnectionsTool, 'handler');
        const { client, server } = await createTestClient(['environment:mcp']);

        try {
            const result = await client.callTool({ name: 'connections_list', arguments: {} });

            expect(result).toStrictEqual({
                content: [{ type: 'text', text: 'MCP error -32602: Tool connections_list disabled' }],
                isError: true
            });
            expect(handlerSpy).not.toHaveBeenCalled();
        } finally {
            handlerSpy.mockRestore();
            await client.close();
            await server.close();
        }
    });

    it('returns connection lists as JSON text and structured content', async () => {
        const response = {
            connections: [
                {
                    id: 1,
                    connection_id: 'connection-id',
                    provider_config_key: 'github',
                    provider: 'github',
                    created: '2026-01-01T00:00:00.000Z',
                    metadata: null,
                    tags: {},
                    errors: [],
                    end_user: null
                }
            ]
        };
        const handlerSpy = vi.spyOn(listConnectionsTool, 'handler').mockResolvedValueOnce(Ok(response));
        const { client, server } = await createTestClient(['environment:connections:list']);

        try {
            const result = await client.callTool({ name: 'connections_list', arguments: { integration_id: 'github' } });

            expect(result).toStrictEqual({
                content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
                structuredContent: response
            });
            expect(handlerSpy).toHaveBeenCalledOnce();
        } finally {
            handlerSpy.mockRestore();
            await client.close();
            await server.close();
        }
    });

    it('returns invalid connection list arguments as a public tool error', async () => {
        const { client, server } = await createTestClient(['environment:connections:list']);

        try {
            const result = await client.callTool({ name: 'connections_list', arguments: { limit: 0 } });

            expect(result).toMatchObject({
                content: [{ type: 'text', text: expect.stringContaining('Invalid arguments for tool connections_list') }],
                isError: true
            });
        } finally {
            await client.close();
            await server.close();
        }
    });

    it.each(['environment:functions:list', 'environment:functions:*'])('exposes the read-only functions list tool with %s', async (scope) => {
        const { client, server } = await createTestClient([scope]);

        try {
            const result = await client.listTools();
            const scopedTools = withoutUnscopedTools(result.tools);

            expect(scopedTools).toHaveLength(1);
            expect(scopedTools[0]).toMatchObject({
                name: 'functions_list',
                annotations: { readOnlyHint: true }
            });
        } finally {
            await client.close();
            await server.close();
        }
    });

    it('authorizes function listing before invoking the tool', async () => {
        const handlerSpy = vi.spyOn(listFunctionsTool, 'handler');
        const { client, server } = await createTestClient(['environment:mcp']);

        try {
            const result = await client.callTool({ name: 'functions_list', arguments: { integration_id: 'github' } });

            expect(result).toStrictEqual({
                content: [{ type: 'text', text: 'MCP error -32602: Tool functions_list disabled' }],
                isError: true
            });
            expect(handlerSpy).not.toHaveBeenCalled();
        } finally {
            handlerSpy.mockRestore();
            await client.close();
            await server.close();
        }
    });

    it('returns function lists as JSON text and structured content', async () => {
        const response = {
            data: [
                {
                    id: 1,
                    name: 'create-issue',
                    type: 'action' as const,
                    returns: ['Issue'],
                    json_schema: null,
                    enabled: true,
                    last_deployed: '2026-01-01T00:00:00.000Z',
                    source: 'repo' as const
                }
            ],
            pagination: { total: 1, page: 0, limit: 20 }
        };
        const handlerSpy = vi.spyOn(listFunctionsTool, 'handler').mockResolvedValueOnce(Ok(response));
        const { client, server } = await createTestClient(['environment:functions:list']);

        try {
            const result = await client.callTool({ name: 'functions_list', arguments: { integration_id: 'github' } });

            expect(result).toStrictEqual({
                content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
                structuredContent: response
            });
            expect(handlerSpy).toHaveBeenCalledOnce();
        } finally {
            handlerSpy.mockRestore();
            await client.close();
            await server.close();
        }
    });

    it.each(['environment:syncs:execute', 'environment:syncs:*'])('exposes the sync tools with %s', async (scope) => {
        const { client, server } = await createTestClient([scope]);

        try {
            const result = await client.listTools();
            const scopedTools = withoutUnscopedTools(result.tools);

            expect(scopedTools).toHaveLength(2);
            expect(scopedTools[0]).toMatchObject({
                name: 'syncs_set_state',
                inputSchema: {
                    type: 'object',
                    required: ['syncs', 'integration_id', 'state'],
                    additionalProperties: false
                },
                outputSchema: {
                    type: 'object',
                    required: ['success'],
                    additionalProperties: false
                },
                annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
            });
            expect(scopedTools[0]?.inputSchema.properties).toEqual({
                syncs: {
                    minItems: 0,
                    maxItems: 256,
                    type: 'array',
                    items: {
                        anyOf: [
                            { type: 'string' },
                            {
                                type: 'object',
                                properties: { name: { type: 'string' }, variant: { type: 'string' } },
                                required: ['name', 'variant'],
                                additionalProperties: false
                            }
                        ]
                    }
                },
                integration_id: { type: 'string', maxLength: 255, pattern: '^[a-zA-Z0-9~:.@ _-]+$' },
                connection_id: { type: 'string', maxLength: 255, pattern: `^[a-zA-Z0-9,.;:=+~[\\]|@\${}"'\\\\/_ -]+$` },
                state: { type: 'string', enum: ['started', 'paused'] }
            });
            expect(scopedTools[1]).toMatchObject({
                name: 'syncs_trigger',
                inputSchema: {
                    type: 'object',
                    properties: {
                        reset: expect.objectContaining({ type: 'boolean', default: false }),
                        empty_cache: expect.objectContaining({ type: 'boolean', default: false })
                    },
                    required: ['syncs', 'integration_id'],
                    additionalProperties: false
                },
                outputSchema: {
                    type: 'object',
                    required: ['success'],
                    additionalProperties: false
                },
                annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
            });
        } finally {
            await client.close();
            await server.close();
        }
    });

    it('authorizes syncs_set_state before invoking the tool', async () => {
        const handlerSpy = vi.spyOn(setSyncsStateTool, 'handler');
        const { client, server } = await createTestClient(['environment:mcp']);

        try {
            const result = await client.callTool({
                name: 'syncs_set_state',
                arguments: { integration_id: 'github', syncs: ['issues'], state: 'started' }
            });

            expect(result).toStrictEqual({
                content: [{ type: 'text', text: 'MCP error -32602: Tool syncs_set_state disabled' }],
                isError: true
            });
            expect(handlerSpy).not.toHaveBeenCalled();
        } finally {
            handlerSpy.mockRestore();
            await client.close();
            await server.close();
        }
    });

    it('returns syncs_set_state results as JSON text and structured content', async () => {
        const response = { success: true as const };
        const handlerSpy = vi.spyOn(setSyncsStateTool, 'handler').mockResolvedValueOnce(Ok(response));
        const { client, server } = await createTestClient(['environment:syncs:execute']);

        try {
            const result = await client.callTool({
                name: 'syncs_set_state',
                arguments: { integration_id: 'github', syncs: ['issues'], state: 'started' }
            });

            expect(result).toStrictEqual({
                content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
                structuredContent: response
            });
            expect(handlerSpy).toHaveBeenCalledOnce();
        } finally {
            handlerSpy.mockRestore();
            await client.close();
            await server.close();
        }
    });

    it('authorizes syncs_trigger before invoking the tool', async () => {
        const handlerSpy = vi.spyOn(triggerSyncsTool, 'handler');
        const { client, server } = await createTestClient(['environment:mcp']);

        try {
            const result = await client.callTool({
                name: 'syncs_trigger',
                arguments: { integration_id: 'github', syncs: ['issues'] }
            });

            expect(result).toStrictEqual({
                content: [{ type: 'text', text: 'MCP error -32602: Tool syncs_trigger disabled' }],
                isError: true
            });
            expect(handlerSpy).not.toHaveBeenCalled();
        } finally {
            handlerSpy.mockRestore();
            await client.close();
            await server.close();
        }
    });

    it('returns syncs_trigger results as JSON text and structured content', async () => {
        const response = { success: true as const };
        const handlerSpy = vi.spyOn(triggerSyncsTool, 'handler').mockResolvedValueOnce(Ok(response));
        const { client, server } = await createTestClient(['environment:syncs:execute']);

        try {
            const result = await client.callTool({
                name: 'syncs_trigger',
                arguments: { integration_id: 'github', syncs: ['issues'], reset: true, empty_cache: true }
            });

            expect(result).toStrictEqual({
                content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
                structuredContent: response
            });
            expect(handlerSpy).toHaveBeenCalledOnce();
        } finally {
            handlerSpy.mockRestore();
            await client.close();
            await server.close();
        }
    });

    it('exposes separate deployment tools and a read-only status tool', async () => {
        const authorized = await createTestClient(['environment:deploy']);
        try {
            const result = await authorized.client.listTools();
            const scopedTools = withoutUnscopedTools(result.tools);
            expect(scopedTools).toHaveLength(3);
            expect(scopedTools).toMatchObject([
                {
                    name: 'deploy_function',
                    inputSchema: {
                        type: 'object',
                        required: ['integration_id', 'function_name', 'function_type', 'code'],
                        additionalProperties: false
                    },
                    outputSchema: {
                        type: 'object',
                        required: ['id', 'status', 'created_at'],
                        additionalProperties: false
                    }
                },
                {
                    name: 'deploy_template',
                    inputSchema: {
                        type: 'object',
                        required: ['integration_id', 'template'],
                        additionalProperties: false
                    }
                },
                {
                    name: 'get_deployment_status',
                    inputSchema: {
                        type: 'object',
                        required: ['id'],
                        additionalProperties: false
                    },
                    outputSchema: {
                        type: 'object',
                        required: ['id', 'status', 'integration_id', 'function_name', 'function_type', 'created_at', 'updated_at'],
                        additionalProperties: false
                    }
                }
            ]);
        } finally {
            await authorized.client.close();
            await authorized.server.close();
        }

        const handlerSpy = vi.spyOn(deployFunctionTool, 'handler');
        const unauthorized = await createTestClient(['environment:functions:*']);
        try {
            const result = await unauthorized.client.callTool({
                name: 'deploy_function',
                arguments: { integration_id: 'github', function_name: 'issues', function_type: 'sync', code: 'code' }
            });

            expect(result).toStrictEqual({
                content: [{ type: 'text', text: 'MCP error -32602: Tool deploy_function disabled' }],
                isError: true
            });
            expect(handlerSpy).not.toHaveBeenCalled();
        } finally {
            handlerSpy.mockRestore();
            await unauthorized.client.close();
            await unauthorized.server.close();
        }
    });

    it('returns function deployment results as JSON text and structured content', async () => {
        const response = {
            id: '3c66291f-6247-47a6-a100-f4d621d751f7',
            status: 'running' as const,
            created_at: '2026-01-01T00:00:00.000Z'
        };
        const handlerSpy = vi.spyOn(deployFunctionTool, 'handler').mockResolvedValueOnce(Ok(response));
        const { client, server } = await createTestClient(['environment:deploy']);

        try {
            const result = await client.callTool({
                name: 'deploy_function',
                arguments: {
                    integration_id: 'github',
                    function_name: 'sync-issues',
                    function_type: 'sync',
                    code: 'export default {}'
                }
            });

            expect(result).toStrictEqual({
                content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
                structuredContent: response
            });
            expect(handlerSpy).toHaveBeenCalledOnce();
        } finally {
            handlerSpy.mockRestore();
            await client.close();
            await server.close();
        }
    });

    it('returns deployment statuses as JSON text and structured content', async () => {
        const response = {
            id: '3c66291f-6247-47a6-a100-f4d621d751f7',
            status: 'success' as const,
            integration_id: 'github',
            function_name: 'sync-issues',
            function_type: 'sync' as const,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:01:00.000Z',
            completed_at: '2026-01-01T00:01:00.000Z'
        };
        const handlerSpy = vi.spyOn(getDeploymentStatusTool, 'handler').mockResolvedValueOnce(Ok(response));
        const { client, server } = await createTestClient(['environment:deploy']);

        try {
            const result = await client.callTool({ name: 'get_deployment_status', arguments: { id: response.id } });

            expect(result).toStrictEqual({
                content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
                structuredContent: response
            });
            expect(handlerSpy).toHaveBeenCalledOnce();
        } finally {
            handlerSpy.mockRestore();
            await client.close();
            await server.close();
        }
    });

    it('authorizes integration creation before invoking the tool', async () => {
        const handlerSpy = vi.spyOn(createIntegrationsTool, 'handler');
        const { client, server } = await createTestClient(['environment:mcp']);

        try {
            const result = await client.callTool({ name: 'integrations_create', arguments: {} });

            expect(result).toStrictEqual({
                content: [{ type: 'text', text: 'MCP error -32602: Tool integrations_create disabled' }],
                isError: true
            });
            expect(handlerSpy).not.toHaveBeenCalled();
        } finally {
            handlerSpy.mockRestore();
            await client.close();
            await server.close();
        }
    });

    it('audits a requested mutation when its tool is disabled for insufficient scopes', async () => {
        flags.hasAuditTrail = true;
        const auditSpy = vi.spyOn(audit, 'record').mockResolvedValue(Ok(undefined));
        const requestBody = {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
                name: 'integrations_create',
                arguments: { credentials: { client_secret: 'credential-secret-value' } }
            }
        };
        const server = createManagementMcpServer(
            {
                account: fakeAccount(),
                environment: fakeEnvironment(),
                plan: null,
                grantedScopes: ['environment:mcp'],
                audit: {
                    kind: 'request',
                    actor: { type: 'api_key', id: '7', display: 'Management key' },
                    context: { ip: '127.0.0.1', userAgent: 'test-client' }
                }
            },
            requestBody
        );

        try {
            await vi.waitFor(() => expect(auditSpy).toHaveBeenCalledOnce());
            const event = auditSpy.mock.calls[0]?.[0];
            expect(event).toMatchObject({
                accountId: 1,
                environment: { id: 'test-environment', display: 'dev' },
                actor: { type: 'api_key', id: '7', display: 'Management key' },
                resource: 'integration',
                action: 'created',
                targets: [],
                context: { interface: 'mcp', ip: '127.0.0.1', userAgent: 'test-client' },
                outcome: 'denied'
            });
            expect(typeof event?.occurredAt).toBe('string');
            expect(JSON.stringify(event)).not.toContain('credential-secret-value');
        } finally {
            await server.close();
        }
    });

    it.each(['started', 'paused'] as const)('audits a denied sync state change as %s even when other arguments are invalid', async (state) => {
        flags.hasAuditTrail = true;
        const auditSpy = vi.spyOn(audit, 'record').mockResolvedValue(Ok(undefined));
        const requestBody = {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
                name: 'syncs_set_state',
                arguments: { integration_id: 42, connection_id: 'connection-secret', syncs: [{ name: 'issues' }], state }
            }
        };
        const server = createManagementMcpServer(
            {
                account: fakeAccount(),
                environment: fakeEnvironment(),
                plan: null,
                grantedScopes: ['environment:mcp'],
                audit: {
                    kind: 'request',
                    actor: { type: 'api_key', id: '7', display: 'Management key' },
                    context: { ip: '127.0.0.1', userAgent: 'test-client' }
                }
            },
            requestBody
        );

        try {
            await vi.waitFor(() => expect(auditSpy).toHaveBeenCalledOnce());
            const event = auditSpy.mock.calls[0]?.[0];
            expect(event).toMatchObject({
                resource: 'sync',
                action: state,
                targets: [],
                outcome: 'denied'
            });
            expect(event).not.toHaveProperty('metadata');
            expect(JSON.stringify(event)).not.toContain('connection-secret');
        } finally {
            await server.close();
        }
    });

    it.each(['started', 'paused'] as const)('audits an authorized invalid sync state change as a failed %s attempt', async (state) => {
        flags.hasAuditTrail = true;
        const auditSpy = vi.spyOn(audit, 'record').mockResolvedValue(Ok(undefined));
        const server = createManagementMcpServer(
            {
                account: fakeAccount(),
                environment: fakeEnvironment(),
                plan: null,
                grantedScopes: ['environment:syncs:execute'],
                audit: {
                    kind: 'request',
                    actor: { type: 'api_key', id: '7', display: 'Management key' },
                    context: { ip: '127.0.0.1', userAgent: 'test-client' }
                }
            },
            {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: 'syncs_set_state', arguments: { integration_id: 42, state } }
            }
        );

        try {
            await vi.waitFor(() => expect(auditSpy).toHaveBeenCalledOnce());
            const event = auditSpy.mock.calls[0]?.[0];
            expect(event).toMatchObject({ resource: 'sync', action: state, targets: [], outcome: 'failure' });
            expect(event).not.toHaveProperty('metadata');
        } finally {
            await server.close();
        }
    });

    it('does not audit a denied sync state change when the state is invalid', async () => {
        flags.hasAuditTrail = true;
        const auditSpy = vi.spyOn(audit, 'record').mockResolvedValue(Ok(undefined));
        const server = createManagementMcpServer(
            {
                account: fakeAccount(),
                environment: fakeEnvironment(),
                plan: null,
                grantedScopes: ['environment:mcp'],
                audit: {
                    kind: 'request',
                    actor: { type: 'api_key', id: '7', display: 'Management key' },
                    context: { ip: '127.0.0.1', userAgent: 'test-client' }
                }
            },
            {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: 'syncs_set_state', arguments: { state: 'invalid' } }
            }
        );

        try {
            expect(auditSpy).not.toHaveBeenCalled();
        } finally {
            await server.close();
        }
    });

    it('returns integration creation results as JSON text and structured content', async () => {
        const response = {
            data: {
                unique_key: 'algolia-mcp',
                provider: 'algolia',
                display_name: 'Algolia MCP',
                logo: 'https://example.com/algolia.svg',
                forward_webhooks: true,
                created_at: '2026-01-01T00:00:00.000Z',
                updated_at: '2026-01-01T00:00:00.000Z'
            }
        };
        const handlerSpy = vi.spyOn(createIntegrationsTool, 'handler').mockResolvedValueOnce(Ok(response));
        const { client, server } = await createTestClient(['environment:integrations:create']);

        try {
            const result = await client.callTool({
                name: 'integrations_create',
                arguments: { provider: 'algolia', integration_id: 'algolia-mcp', credential_source: 'own' }
            });

            expect(result).toStrictEqual({
                content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
                structuredContent: response
            });
            expect(handlerSpy).toHaveBeenCalledOnce();
        } finally {
            handlerSpy.mockRestore();
            await client.close();
            await server.close();
        }
    });

    it('disables scoped tools when required scopes are missing', async () => {
        const handlerSpy = vi.spyOn(listLogOperationsTool, 'handler');
        const { client, server } = await createTestClient(['environment:mcp']);

        try {
            await expect(client.listTools()).resolves.toMatchObject({
                tools: [{ name: 'docs_search' }, { name: 'docs_query_filesystem' }, { name: 'providers_get' }]
            });
            const result = await client.callTool({ name: 'logs_list_operations', arguments: {} });

            expect(result).toStrictEqual({
                content: [{ type: 'text', text: 'MCP error -32602: Tool logs_list_operations disabled' }],
                isError: true
            });
            expect(handlerSpy).not.toHaveBeenCalled();
        } finally {
            handlerSpy.mockRestore();
            await client.close();
            await server.close();
        }
    });

    it('wraps successful tool results as JSON text and structured content', async () => {
        const response = {
            operations: [],
            pagination: { total: 0, cursor: null }
        };
        const handlerSpy = vi.spyOn(listLogOperationsTool, 'handler').mockResolvedValueOnce(Ok(response));
        const { client, server } = await createTestClient(['environment:logs:read']);

        try {
            const result = await client.callTool({
                name: 'logs_list_operations',
                arguments: {}
            });

            expect(result).toStrictEqual({
                content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
                structuredContent: response
            });
            expect(handlerSpy).toHaveBeenCalledOnce();
        } finally {
            handlerSpy.mockRestore();
            await client.close();
            await server.close();
        }
    });

    it('returns a tool error result when an enabled tool handler throws a public error', async () => {
        const handlerSpy = vi.spyOn(listLogOperationsTool, 'handler').mockResolvedValueOnce(Err(new PublicMcpError('Operation not found')));
        const { client, server } = await createTestClient(['environment:logs:read']);

        try {
            const result = await client.callTool({
                name: 'logs_list_operations',
                arguments: {}
            });

            expect(result).toStrictEqual({
                content: [{ type: 'text', text: 'Operation not found' }],
                isError: true
            });
            expect(handlerSpy).toHaveBeenCalledOnce();
        } finally {
            handlerSpy.mockRestore();
            await client.close();
            await server.close();
        }
    });

    it('does not expose unexpected tool handler error messages returned as results', async () => {
        const handlerSpy = vi.spyOn(listLogOperationsTool, 'handler').mockResolvedValueOnce(Err(new Error('sensitive internal error')));
        const { client, server } = await createTestClient(['environment:logs:read']);

        try {
            const result = await client.callTool({
                name: 'logs_list_operations',
                arguments: {}
            });

            expect(result).toStrictEqual({
                content: [{ type: 'text', text: 'Internal error' }],
                isError: true
            });
            expect(handlerSpy).toHaveBeenCalledOnce();
        } finally {
            handlerSpy.mockRestore();
            await client.close();
            await server.close();
        }
    });

    it('does not expose unexpected tool handler error messages', async () => {
        const handlerSpy = vi.spyOn(listLogOperationsTool, 'handler').mockRejectedValueOnce(new Error('sensitive internal error'));
        const { client, server } = await createTestClient(['environment:logs:read']);

        try {
            const result = await client.callTool({
                name: 'logs_list_operations',
                arguments: {}
            });

            expect(result).toStrictEqual({
                content: [{ type: 'text', text: 'Internal error' }],
                isError: true
            });
            expect(handlerSpy).toHaveBeenCalledOnce();
        } finally {
            handlerSpy.mockRestore();
            await client.close();
            await server.close();
        }
    });

    it('returns an explicit public error when logs are disabled', async () => {
        const previousLogsEnabled = logsEnvs.NANGO_LOGS_ENABLED;
        logsEnvs.NANGO_LOGS_ENABLED = false;

        try {
            const result = await listLogOperationsTool.handler(
                {},
                { account: fakeAccount(), environment: fakeEnvironment(), plan: null, grantedScopes: ['environment:logs:read'] }
            );

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error).toBeInstanceOf(PublicMcpError);
                expect(result.error.message).toBe('Nango logs are disabled');
            }
        } finally {
            logsEnvs.NANGO_LOGS_ENABLED = previousLogsEnabled;
        }
    });
});

async function createTestClient(grantedScopes: string[]): Promise<{ client: Client; server: McpServer }> {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createManagementMcpServer({ account: fakeAccount(), environment: fakeEnvironment(), plan: null, grantedScopes });
    const client = new Client({ name: 'test-client', version: '1.0.0' });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    return { client, server };
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

function fakeEnvironment(): DBEnvironment {
    const now = new Date();
    return {
        id: 1,
        uuid: 'test-environment',
        name: 'dev',
        account_id: 1,
        secret_key: 'secret',
        public_key: 'public',
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
        is_production: false,
        deleted_at: null,
        deleted: false,
        created_at: now,
        updated_at: now
    };
}
