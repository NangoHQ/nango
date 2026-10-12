import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as shared from '@nangohq/shared';
import { Err, metrics, Ok } from '@nangohq/utils';

import { createConnectionToolsMcpServer } from './connectionToolsServer.js';

import type { Server } from '@modelcontextprotocol/server';
import type { Config } from '@nangohq/shared';
import type { DBConnectionDecrypted, DBEnvironment, DBTeam, ListedNangoActionFunction } from '@nangohq/types';

const mocks = vi.hoisted(() => ({
    executeAction: vi.fn()
}));

vi.mock('../../services/action.service.js', () => ({
    executeAction: mocks.executeAction
}));

describe('createConnectionToolsMcpServer', () => {
    beforeEach(() => {
        vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(providerConfig);
        vi.spyOn(metrics, 'increment').mockImplementation(() => undefined);
        vi.spyOn(shared.legacyFunctionService, 'listActions').mockResolvedValue(Ok([]));
        mocks.executeAction.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('does not advertise a disabled action and reports direct calls as unavailable', async () => {
        vi.spyOn(shared.legacyFunctionService, 'listActions').mockResolvedValue(Ok([actionFixture({ enabled: false })]));
        const disabledActionError = Object.assign(new Error('The action is disabled'), {
            code: 'disabled_action',
            nangoError: undefined
        });
        mocks.executeAction.mockResolvedValue({
            logCtx: undefined,
            result: Err(disabledActionError)
        });
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

            expect(mocks.executeAction).toHaveBeenCalled();
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
        vi.spyOn(shared.legacyFunctionService, 'listActions').mockResolvedValue(Ok([action]));
        mocks.executeAction.mockResolvedValue({ logCtx: undefined, result: Ok({ data: { deleted: true } }) });
        const { client, server } = await createTestClient();

        try {
            const listed = await client.listTools();
            expect(listed.tools.map((tool) => tool.name)).toEqual(['delete-repository']);

            const result = await client.callTool({ name: 'delete-repository', arguments: { id: 'repo-1' } });

            expect(result).toStrictEqual({
                content: [{ type: 'text', text: JSON.stringify({ deleted: true }, null, 2) }]
            });
            expect(mocks.executeAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    account,
                    environment,
                    connectionId: connection.connection_id,
                    providerConfigKey: providerConfig.unique_key,
                    actionName: action.name,
                    input: { id: 'repo-1' },
                    isAsync: false,
                    retryMax: 3
                })
            );
        } finally {
            await client.close();
            await server.close();
        }
    });

    it('advertises and executes a catalog action', async () => {
        vi.spyOn(shared.legacyFunctionService, 'listActions').mockResolvedValue(
            Ok([actionFixture({ enabled: true, name: 'delete-file', source: 'tools-catalog' })])
        );
        mocks.executeAction.mockResolvedValue({ logCtx: undefined, result: Ok({ data: { deleted: true } }) });
        const { client, server } = await createTestClient();

        try {
            const listed = await client.listTools();
            expect(listed.tools.map((tool) => tool.name)).toContain('delete-file');

            const result = await client.callTool({ name: 'delete-file', arguments: { id: 'repo-1' } });

            expect(result).toStrictEqual({
                content: [{ type: 'text', text: JSON.stringify({ deleted: true }, null, 2) }]
            });
            expect(mocks.executeAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    account,
                    environment,
                    connectionId: connection.connection_id,
                    providerConfigKey: providerConfig.unique_key,
                    actionName: 'delete-file',
                    input: { id: 'repo-1' },
                    isAsync: false,
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

function actionFixture({
    enabled,
    name = 'delete-repository',
    source = 'repo'
}: {
    enabled: boolean;
    name?: string;
    source?: 'repo' | 'tools-catalog';
}): ListedNangoActionFunction {
    return {
        id: source === 'tools-catalog' ? null : 30,
        name,
        type: 'action',
        enabled,
        returns: [],
        json_schema: null,
        last_deployed: source === 'tools-catalog' ? null : new Date().toISOString(),
        source
    };
}

const account = { id: 1 } as DBTeam;
const environment = { id: 2 } as DBEnvironment;
const connection = { id: 3, connection_id: 'github-acme', provider_config_key: 'github', environment_id: environment.id } as DBConnectionDecrypted;
const providerConfig = { id: 4, unique_key: 'github', provider: 'github' } as Config;
