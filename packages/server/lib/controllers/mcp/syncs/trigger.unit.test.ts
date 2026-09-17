import { afterEach, describe, expect, it, vi } from 'vitest';

import { RunSyncCommandError, syncManager } from '@nangohq/shared';

import { PublicMcpError } from '../utils.js';
import { triggerSyncsTool } from './trigger.js';

import type { ManagementMcpContext } from '../managementTool.js';

describe('triggerSyncsTool', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it.each([
        { options: {}, command: 'RUN', deleteRecords: false },
        { options: { reset: true }, command: 'RUN_FULL', deleteRecords: false },
        { options: { reset: true, empty_cache: true }, command: 'RUN_FULL', deleteRecords: true }
    ])('maps trigger options to $command with deleteRecords=$deleteRecords', async ({ options, command, deleteRecords }) => {
        const runSyncCommandSpy = vi.spyOn(syncManager, 'runSyncCommand').mockResolvedValue({ success: true, response: true, error: null });
        const syncs = ['issues', { name: 'users', variant: 'incremental' }];

        const result = await triggerSyncsTool.handler({ syncs, integration_id: 'github', connection_id: 'connection-id', ...options }, context);

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
            deleteRecords,
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
        { name: 'unknown argument', args: { integration_id: 'github', syncs: [], unexpected: true } },
        { name: 'invalid reset', args: { integration_id: 'github', syncs: [], reset: 'true' } },
        { name: 'invalid empty cache', args: { integration_id: 'github', syncs: [], empty_cache: 1 } },
        { name: 'malformed variant', args: { integration_id: 'github', syncs: [{ name: 'issues' }] } }
    ])('rejects $name before calling the sync manager', async ({ args }) => {
        const runSyncCommandSpy = vi.spyOn(syncManager, 'runSyncCommand');

        const result = await triggerSyncsTool.handler(args, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toContain('Invalid syncs_trigger arguments:');
        }
        expect(runSyncCommandSpy).not.toHaveBeenCalled();
    });

    it('maps public sync manager errors', async () => {
        vi.spyOn(syncManager, 'runSyncCommand').mockResolvedValue({
            success: false,
            response: false,
            error: new RunSyncCommandError('unknown_connection')
        });

        const result = await triggerSyncsTool.handler({ integration_id: 'github', connection_id: 'missing', syncs: ['issues'] }, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toBe('Connection does not exist');
        }
    });
});

const context = {
    account: {},
    environment: { id: 42 },
    grantedScopes: ['environment:syncs:execute']
} as ManagementMcpContext;
