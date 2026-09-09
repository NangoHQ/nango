import { afterEach, describe, expect, it, vi } from 'vitest';

import { RunSyncCommandError, syncManager } from '@nangohq/shared';

import { PublicMcpError } from '../utils.js';
import { setSyncsStateTool } from './setState.js';

import type { ManagementMcpContext } from '../managementTool.js';

describe('setSyncsStateTool', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it.each([
        { state: 'started' as const, command: 'UNPAUSE' },
        { state: 'paused' as const, command: 'PAUSE' }
    ])('maps the $state state to the $command sync command', async ({ state, command }) => {
        const runSyncCommandSpy = vi.spyOn(syncManager, 'runSyncCommand').mockResolvedValue({ success: true, response: true, error: null });
        const syncs = ['issues', { name: 'users', variant: 'incremental' }];

        const result = await setSyncsStateTool.handler({ syncs, integration_id: 'github', connection_id: 'connection-id', state }, context);

        expect(runSyncCommandSpy).toHaveBeenCalledOnce();
        expect(runSyncCommandSpy.mock.calls[0]?.[0]).toMatchObject({
            environment: context.environment,
            providerConfigKey: 'github',
            connectionId: 'connection-id',
            syncIdentifiers: [
                { syncName: 'issues', syncVariant: 'base' },
                { syncName: 'users', syncVariant: 'incremental' }
            ],
            command,
            initiator: 'MCP call'
        });
        expect(runSyncCommandSpy.mock.calls[0]?.[0].orchestrator).toBeDefined();
        expect(runSyncCommandSpy.mock.calls[0]?.[0].logContextGetter).toBeDefined();
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual({ success: true });
        }
    });

    it.each([
        { name: 'unknown argument', args: { integration_id: 'github', syncs: [], state: 'started', unexpected: true } },
        { name: 'missing state', args: { integration_id: 'github', syncs: [] } },
        { name: 'invalid state', args: { integration_id: 'github', syncs: [], state: 'running' } },
        { name: 'malformed variant', args: { integration_id: 'github', syncs: [{ name: 'issues' }], state: 'paused' } }
    ])('rejects $name before calling the sync manager', async ({ args }) => {
        const runSyncCommandSpy = vi.spyOn(syncManager, 'runSyncCommand');

        const result = await setSyncsStateTool.handler(args, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toContain('Invalid syncs_set_state arguments:');
        }
        expect(runSyncCommandSpy).not.toHaveBeenCalled();
    });

    it('maps public sync manager errors', async () => {
        vi.spyOn(syncManager, 'runSyncCommand').mockResolvedValue({
            success: false,
            response: false,
            error: new RunSyncCommandError('no_syncs_found')
        });

        const result = await setSyncsStateTool.handler({ integration_id: 'github', syncs: ['missing'], state: 'started' }, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toBe('No syncs found given the inputs.');
        }
    });
});

const context = {
    account: {},
    environment: { id: 42 },
    grantedScopes: ['environment:syncs:execute']
} as ManagementMcpContext;
