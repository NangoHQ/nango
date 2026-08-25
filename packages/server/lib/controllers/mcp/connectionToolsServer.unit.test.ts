import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { Err, metrics, Ok } from '@nangohq/utils';

import { callToolRequestHandler } from './connectionToolsServer.js';

import type { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import type { Config } from '@nangohq/shared';
import type { DBConnectionDecrypted, DBEnvironment, DBSyncConfig, DBTeam } from '@nangohq/types';

const { triggerAction } = vi.hoisted(() => ({ triggerAction: vi.fn() }));

vi.mock('../../utils/utils.js', () => ({
    getOrchestrator: () => ({ triggerAction })
}));

const account = { id: 1 } as DBTeam;
const environment = { id: 2 } as DBEnvironment;
const connection = { id: 3, connection_id: 'connection-id' } as DBConnectionDecrypted;
const providerConfig = { id: 4, unique_key: 'github', provider: 'github' } as Config;
const action = {
    id: 5,
    sync_name: 'get_issue',
    enabled: true,
    metadata: {}
} as DBSyncConfig;
const logCtx = {
    operation: { environmentId: null },
    attachSpan: vi.fn(),
    failed: vi.fn()
} as unknown as Awaited<ReturnType<typeof logContextGetter.create>>;

describe('callToolRequestHandler', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
        vi.spyOn(logContextGetter, 'create').mockResolvedValue(logCtx);
        vi.spyOn(metrics, 'increment').mockImplementation(() => undefined);
    });

    it('records a successful action execution', async () => {
        triggerAction.mockResolvedValue(Ok({ data: { issue: 'NAN-6716' } }));

        const result = await handler()(toolCall('get_issue'));

        expect(result).toStrictEqual({ content: [{ type: 'text', text: JSON.stringify({ issue: 'NAN-6716' }, null, 2) }] });
        expectMcpMetric({ mcp_type: 'legacy_connection_tools', outcome: 'success' });
    });

    it('records an action execution error result', async () => {
        triggerAction.mockResolvedValue(Err(new Error('action failed')));

        await expect(handler()(toolCall('get_issue'))).rejects.toThrow();

        expectMcpMetric({ mcp_type: 'legacy_connection_tools', outcome: 'error' });
    });

    it('records a thrown action execution error', async () => {
        triggerAction.mockRejectedValue(new Error('orchestrator unavailable'));

        await expect(handler()(toolCall('get_issue'))).rejects.toThrow('orchestrator unavailable');

        expectMcpMetric({ mcp_type: 'legacy_connection_tools', outcome: 'error' });
    });

    it('does not record calls rejected before action execution starts', async () => {
        await expect(handler()(toolCall('unknown_action'))).rejects.toThrow('Action unknown_action not found');

        expect(triggerAction).not.toHaveBeenCalled();
        expect(mcpMetricCalls()).toStrictEqual([]);
    });
});

function handler() {
    return callToolRequestHandler([action], account, environment, connection, providerConfig);
}

function toolCall(name: string): CallToolRequest {
    return { method: 'tools/call', params: { name, arguments: {} } };
}

function mcpMetricCalls() {
    return vi.mocked(metrics.increment).mock.calls.filter(([metric]) => metric === metrics.Types.MCP_TOOL_CALLS);
}

function expectMcpMetric(dimensions: { mcp_type: 'legacy_connection_tools'; outcome: 'success' | 'error' }) {
    expect(mcpMetricCalls()).toStrictEqual([[metrics.Types.MCP_TOOL_CALLS, 1, dimensions]]);
}
