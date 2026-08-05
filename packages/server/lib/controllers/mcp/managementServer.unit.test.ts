import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it, vi } from 'vitest';

import { envs as logsEnvs } from '@nangohq/logs';
import { Err, Ok } from '@nangohq/utils';

import { createIntegrationsTool } from './integrations/create.js';
import { deleteIntegrationsTool } from './integrations/delete.js';
import { updateIntegrationsTool } from './integrations/update.js';
import { listLogOperationsTool } from './logs/listOperations.js';
import { createManagementMcpServer } from './managementServer.js';
import { PublicMcpError } from './utils.js';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DBEnvironment, DBTeam } from '@nangohq/types';

describe('createManagementMcpServer', () => {
    it('exposes all management tools when the environment wildcard scope is granted', async () => {
        const { client, server } = await createTestClient(['environment:*']);

        try {
            const result = await client.listTools();

            expect(result.tools.map((tool) => tool.name)).toStrictEqual([
                'integrations_list',
                'integrations_get',
                'integrations_create',
                'integrations_update',
                'integrations_delete',
                'logs_list_operations',
                'logs_get_operation'
            ]);
        } finally {
            await client.close();
            await server.close();
        }
    });

    it('exposes the integrations list tool when its scope is granted', async () => {
        const { client, server } = await createTestClient(['environment:integrations:list']);

        try {
            const result = await client.listTools();

            expect(result.tools.map((tool) => tool.name)).toStrictEqual(['integrations_list']);
        } finally {
            await client.close();
            await server.close();
        }
    });

    it.each(['environment:integrations:read', 'environment:integrations:read_credentials'])('exposes the integrations get tool with %s', async (scope) => {
        const { client, server } = await createTestClient([scope]);

        try {
            const result = await client.listTools();

            expect(result.tools).toHaveLength(1);
            expect(result.tools[0]).toMatchObject({
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

            expect(result.tools).toHaveLength(1);
            expect(result.tools[0]).toMatchObject({
                name: 'integrations_create',
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

            expect(result.tools.map((tool) => tool.name)).toStrictEqual([
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

    it('exposes and authorizes the idempotent integration update tool', async () => {
        const authorized = await createTestClient(['environment:integrations:update']);
        try {
            const result = await authorized.client.listTools();
            expect(result.tools).toHaveLength(1);
            expect(result.tools[0]).toMatchObject({
                name: 'integrations_update',
                annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
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

    it('exposes and authorizes the destructive integration delete tool', async () => {
        const authorized = await createTestClient(['environment:integrations:delete']);
        try {
            const result = await authorized.client.listTools();
            expect(result.tools).toHaveLength(1);
            expect(result.tools[0]).toMatchObject({
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

    it('disables tools when required scopes are missing', async () => {
        const handlerSpy = vi.spyOn(listLogOperationsTool, 'handler');
        const { client, server } = await createTestClient(['environment:mcp']);

        try {
            await expect(client.listTools()).resolves.toStrictEqual({ tools: [] });
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
                { account: fakeAccount(), environment: fakeEnvironment(), grantedScopes: ['environment:logs:read'] }
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
    const server = createManagementMcpServer({ account: fakeAccount(), environment: fakeEnvironment(), grantedScopes });
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
