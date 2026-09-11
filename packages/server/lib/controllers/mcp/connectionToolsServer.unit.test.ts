import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import * as shared from '@nangohq/shared';
import { metrics, Ok } from '@nangohq/utils';

import { createConnectionToolsMcpServer } from './connectionToolsServer.js';

import type { Server } from '@modelcontextprotocol/server';
import type { LogContextOrigin } from '@nangohq/logs';
import type { Config } from '@nangohq/shared';
import type { DBConnectionDecrypted, DBEnvironment, DBSyncConfig, DBTeam } from '@nangohq/types';

const mocks = vi.hoisted(() => ({
    triggerAction: vi.fn()
}));

vi.mock('../../utils/utils.js', () => ({
    getOrchestrator: () => ({ triggerAction: mocks.triggerAction })
}));

describe('createConnectionToolsMcpServer', () => {
    beforeEach(() => {
        vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(providerConfig);
        vi.spyOn(metrics, 'increment').mockImplementation(() => undefined);
        mocks.triggerAction.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('does not advertise or execute a disabled action called directly by name', async () => {
        vi.spyOn(shared, 'getActionsByProviderConfigKey').mockResolvedValue([actionFixture({ enabled: false })]);
        const { client, server } = await createTestClient();

        try {
            const listed = await client.listTools();
            expect(listed.tools).toEqual([]);

            const result = await client.callTool({ name: 'delete-repository', arguments: {} });
            expect(result.isError).toBe(true);
            expect(result.content).toStrictEqual([
                {
                    type: 'text',
                    text: "Tool 'delete-repository' is not available on integration 'github'. Use another tool for the task, or tell the user it cannot be done."
                }
            ]);
            expect(result._meta).toStrictEqual({ 'nango/error_code': 'tool_not_available', 'nango/integration_id': 'github' });

            expect(mocks.triggerAction).not.toHaveBeenCalled();
            expect(metrics.increment).toHaveBeenCalledWith(metrics.Types.MCP_TOOL_CALLS, 1, {
                mcp_type: 'legacy_connection_tools',
                outcome: 'error'
            });
        } finally {
            await client.close();
            await server.close();
        }
    });

    it('continues to advertise and execute an enabled action', async () => {
        const action = actionFixture({ enabled: true });
        vi.spyOn(shared, 'getActionsByProviderConfigKey').mockResolvedValue([action]);
        vi.spyOn(logContextGetter, 'create').mockResolvedValue(logContextFixture());
        mocks.triggerAction.mockResolvedValue(Ok({ data: { deleted: true } }));
        const { client, server } = await createTestClient();

        try {
            const listed = await client.listTools();
            expect(listed.tools.map((tool) => tool.name)).toEqual(['delete-repository']);

            const result = await client.callTool({ name: 'delete-repository', arguments: { id: 'repo-1' } });

            expect(result).toStrictEqual({
                content: [{ type: 'text', text: JSON.stringify({ deleted: true }, null, 2) }]
            });
            expect(mocks.triggerAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    accountId: account.id,
                    connection,
                    actionName: action.sync_name,
                    input: { id: 'repo-1' },
                    async: false,
                    retryMax: 3
                })
            );
        } finally {
            await client.close();
            await server.close();
        }
    });
});

async function createTestClient(): Promise<{ client: Client; server: Server }> {
    const result = await createConnectionToolsMcpServer(account, environment, connection, providerConfig.unique_key);
    if (result.isErr()) {
        throw result.error;
    }

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '1.0.0' });

    await result.value.connect(serverTransport);
    await client.connect(clientTransport);

    return { client, server: result.value };
}

function actionFixture({ enabled }: { enabled: boolean }): DBSyncConfig {
    return {
        id: 30,
        sync_name: 'delete-repository',
        enabled,
        input: null,
        models_json_schema: null,
        metadata: { description: 'Delete a repository' }
    } as DBSyncConfig;
}

function logContextFixture(): LogContextOrigin {
    return {
        operation: { id: 'operation-id' },
        attachSpan: vi.fn(),
        failed: vi.fn()
    } as unknown as LogContextOrigin;
}

const account = { id: 1 } as DBTeam;
const environment = { id: 2 } as DBEnvironment;
const connection = { id: 3, connection_id: 'github-acme', provider_config_key: 'github', environment_id: environment.id } as DBConnectionDecrypted;
const providerConfig = { id: 4, unique_key: 'github', provider: 'github' } as Config;
