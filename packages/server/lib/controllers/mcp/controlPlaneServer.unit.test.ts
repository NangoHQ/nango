import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it, vi } from 'vitest';

import { envs as logsEnvs } from '@nangohq/logs';
import { Err, Ok } from '@nangohq/utils';

import { createControlPlaneMcpServer } from './controlPlaneServer.js';
import { logsListOperationsTool } from './logs/listOperations.js';
import { PublicMcpError } from './utils.js';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DBEnvironment, DBTeam } from '@nangohq/types';

describe('createControlPlaneMcpServer', () => {
    it('disables tools when required scopes are missing', async () => {
        const handlerSpy = vi.spyOn(logsListOperationsTool, 'handler');
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
        const handlerSpy = vi.spyOn(logsListOperationsTool, 'handler').mockResolvedValueOnce(Ok(response));
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
        const handlerSpy = vi.spyOn(logsListOperationsTool, 'handler').mockResolvedValueOnce(Err(new PublicMcpError('Operation not found')));
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
        const handlerSpy = vi.spyOn(logsListOperationsTool, 'handler').mockResolvedValueOnce(Err(new Error('sensitive internal error')));
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
        const handlerSpy = vi.spyOn(logsListOperationsTool, 'handler').mockRejectedValueOnce(new Error('sensitive internal error'));
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

    it('returns an explicit public error for invalid logs list arguments', async () => {
        const previousLogsEnabled = logsEnvs.NANGO_LOGS_ENABLED;
        logsEnvs.NANGO_LOGS_ENABLED = true;

        try {
            await expect(
                logsListOperationsTool.handler(
                    { limit: 0 },
                    { account: fakeAccount(), environment: fakeEnvironment(), grantedScopes: ['environment:logs:read'] }
                )
            ).resolves.toSatisfy((result) => result.isErr() && result.error.message.includes('Invalid logs_list_operations arguments'));
        } finally {
            logsEnvs.NANGO_LOGS_ENABLED = previousLogsEnabled;
        }
    });

    it('returns an explicit public error when logs are disabled', async () => {
        const previousLogsEnabled = logsEnvs.NANGO_LOGS_ENABLED;
        logsEnvs.NANGO_LOGS_ENABLED = false;

        try {
            await expect(
                logsListOperationsTool.handler({}, { account: fakeAccount(), environment: fakeEnvironment(), grantedScopes: ['environment:logs:read'] })
            ).resolves.toSatisfy((result) => result.isErr() && result.error instanceof PublicMcpError && result.error.message === 'Nango logs are disabled');
        } finally {
            logsEnvs.NANGO_LOGS_ENABLED = previousLogsEnabled;
        }
    });
});

async function createTestClient(grantedScopes: string[]): Promise<{ client: Client; server: McpServer }> {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createControlPlaneMcpServer(fakeAccount(), fakeEnvironment(), grantedScopes);
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
