import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';

import connectionService from '../connection.service.js';
import * as configService from './config/config.service.js';
import syncManager from './manager.service.js';
import { getAndReconcileDifferences } from './sync.service.js';
import { Orchestrator } from '../../clients/orchestrator.js';

import type { OrchestratorClientInterface } from '../../clients/orchestrator.js';
import type { SyncConfigWithProvider } from '../../models/Sync.js';
import type { CLIDeployFlowConfig } from '@nangohq/types';

const orchestratorClientNoop: OrchestratorClientInterface = {
    recurring: () => Promise.resolve({}) as any,
    executeAction: () => Promise.resolve({}) as any,
    executeActionAsync: () => Promise.resolve({}) as any,
    executeWebhook: () => Promise.resolve({}) as any,
    executeOnEvent: () => Promise.resolve({}) as any,
    executeSync: () => Promise.resolve({}) as any,
    cancel: () => Promise.resolve({}) as any,
    pauseSync: () => Promise.resolve({}) as any,
    unpauseSync: () => Promise.resolve({}) as any,
    deleteSync: () => Promise.resolve({}) as any,
    updateSyncFrequency: () => Promise.resolve({}) as any,
    searchSchedules: () => Promise.resolve({}) as any,
    getOutput: () => Promise.resolve({}) as any
};
const mockOrchestrator = new Orchestrator(orchestratorClientNoop);

function makeSyncConfig(overrides: Partial<SyncConfigWithProvider> = {}): SyncConfigWithProvider {
    return {
        id: 1,
        sync_name: 'my-sync',
        runs: 'every 1h',
        models: ['MyModel'],
        updated_at: new Date().toISOString(),
        provider_config_key: 'github',
        unique_key: 'github',
        type: 'sync',
        ...overrides
    };
}

function makeFlow(overrides: Partial<CLIDeployFlowConfig> = {}): CLIDeployFlowConfig {
    return {
        syncName: 'my-sync',
        providerConfigKey: 'github',
        models: ['MyModel'],
        runs: 'every 1h',
        type: 'sync',
        auto_start: true,
        track_deletes: false,
        fileBody: { js: '', ts: '' },
        endpoints: [],
        ...overrides
    } as CLIDeployFlowConfig;
}

describe('getAndReconcileDifferences', () => {
    beforeEach(() => {
        vi.spyOn(configService, 'getSyncConfigsByProviderConfigKey').mockResolvedValue([]);
        vi.spyOn(configService, 'getActionConfigByNameAndProviderConfigKey').mockResolvedValue(false);
        vi.spyOn(configService, 'getActiveCustomSyncConfigsByEnvironmentId').mockResolvedValue([]);
        vi.spyOn(connectionService, 'getConnectionsByEnvironmentAndConfig').mockResolvedValue([]);
        vi.spyOn(syncManager, 'createSyncs').mockResolvedValue(true);
        vi.spyOn(syncManager, 'deleteConfig').mockResolvedValue(undefined as any);
        vi.spyOn(syncManager, 'softDeleteSync').mockResolvedValue(undefined as any);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('mode: single', () => {
        it('should not detect deleted syncs when mode is single', async () => {
            // An existing sync that is NOT in the flows being deployed
            const existingSync = makeSyncConfig({ sync_name: 'old-sync', unique_key: 'github' });
            vi.spyOn(configService, 'getActiveCustomSyncConfigsByEnvironmentId').mockResolvedValue([existingSync]);

            const flows: CLIDeployFlowConfig[] = [makeFlow({ syncName: 'new-sync' })];

            const result = await getAndReconcileDifferences({
                environmentId: 1,
                flows,
                performAction: false,
                deployMode: 'single',
                logContextGetter,
                orchestrator: mockOrchestrator
            });

            expect(result).not.toBeNull();
            expect(result!.deletedSyncs).toHaveLength(0);
        });

        it('should not call deleteConfig when mode is single, even with performAction true', async () => {
            const existingSync = makeSyncConfig({ sync_name: 'old-sync', unique_key: 'github' });
            vi.spyOn(configService, 'getActiveCustomSyncConfigsByEnvironmentId').mockResolvedValue([existingSync]);
            const deleteConfigSpy = vi.spyOn(syncManager, 'deleteConfig');

            await getAndReconcileDifferences({
                environmentId: 1,
                flows: [makeFlow({ syncName: 'new-sync' })],
                performAction: true,
                deployMode: 'single',
                logContextGetter,
                orchestrator: mockOrchestrator
            });

            expect(deleteConfigSpy).not.toHaveBeenCalled();
        });
    });

    describe('mode: all', () => {
        it('should detect deleted syncs across all provider config keys', async () => {
            const existingSyncs = [
                makeSyncConfig({ id: 1, sync_name: 'old-sync-github', unique_key: 'github' }),
                makeSyncConfig({ id: 2, sync_name: 'old-sync-slack', unique_key: 'slack' })
            ];
            vi.spyOn(configService, 'getActiveCustomSyncConfigsByEnvironmentId').mockResolvedValue(existingSyncs);

            // Only deploying a github sync; slack sync should be detected as deleted
            const flows: CLIDeployFlowConfig[] = [makeFlow({ syncName: 'old-sync-github', providerConfigKey: 'github' })];
            vi.spyOn(configService, 'getSyncConfigsByProviderConfigKey').mockResolvedValue([{ name: 'old-sync-github', enabled: true } as any]);

            const result = await getAndReconcileDifferences({
                environmentId: 1,
                flows,
                performAction: false,
                deployMode: 'all',
                logContextGetter,
                orchestrator: mockOrchestrator
            });

            expect(result).not.toBeNull();
            expect(result!.deletedSyncs).toHaveLength(1);
            expect(result!.deletedSyncs[0]?.name).toBe('old-sync-slack');
        });

        it('should detect deleted syncs for the deployed provider when mode is all', async () => {
            const existingSync = makeSyncConfig({ sync_name: 'removed-sync', unique_key: 'github' });
            vi.spyOn(configService, 'getActiveCustomSyncConfigsByEnvironmentId').mockResolvedValue([existingSync]);

            // Deploy a different sync for the same provider — 'removed-sync' should be deleted
            const flows: CLIDeployFlowConfig[] = [makeFlow({ syncName: 'new-sync', providerConfigKey: 'github' })];

            const result = await getAndReconcileDifferences({
                environmentId: 1,
                flows,
                performAction: false,
                deployMode: 'all',
                logContextGetter,
                orchestrator: mockOrchestrator
            });

            expect(result).not.toBeNull();
            expect(result!.deletedSyncs).toHaveLength(1);
            expect(result!.deletedSyncs[0]?.name).toBe('removed-sync');
        });
    });

    describe('mode: integration', () => {
        it('should only detect deleted syncs for the integration scope inferred from flows', async () => {
            const existingSyncs = [
                makeSyncConfig({ id: 1, sync_name: 'old-sync-github', unique_key: 'github' }),
                makeSyncConfig({ id: 2, sync_name: 'old-sync-slack', unique_key: 'slack' })
            ];
            vi.spyOn(configService, 'getActiveCustomSyncConfigsByEnvironmentId').mockResolvedValue(existingSyncs);

            // Deploying a new github sync, but NOT removing the old one — slack should be ignored
            const flows: CLIDeployFlowConfig[] = [makeFlow({ syncName: 'new-sync-github', providerConfigKey: 'github' })];

            const result = await getAndReconcileDifferences({
                environmentId: 1,
                flows,
                performAction: false,
                deployMode: 'integration',
                logContextGetter,
                orchestrator: mockOrchestrator
            });

            expect(result).not.toBeNull();
            // old-sync-github is deleted (in 'github' scope inferred from flows[0].providerConfigKey and not in flows)
            expect(result!.deletedSyncs.map((s) => s.name)).toContain('old-sync-github');
            // old-sync-slack should NOT be detected as deleted (outside 'github' scope)
            expect(result!.deletedSyncs.map((s) => s.name)).not.toContain('old-sync-slack');
        });

        it('should not detect deletions for providers outside the integration scope', async () => {
            const existingSyncs = [
                makeSyncConfig({ id: 1, sync_name: 'slack-sync', unique_key: 'slack' }),
                makeSyncConfig({ id: 2, sync_name: 'github-sync', unique_key: 'github' })
            ];
            vi.spyOn(configService, 'getActiveCustomSyncConfigsByEnvironmentId').mockResolvedValue(existingSyncs);

            // Deploying only to 'github'
            const flows: CLIDeployFlowConfig[] = [makeFlow({ syncName: 'github-sync', providerConfigKey: 'github' })];
            vi.spyOn(configService, 'getSyncConfigsByProviderConfigKey').mockResolvedValue([{ name: 'github-sync', enabled: true } as any]);

            const result = await getAndReconcileDifferences({
                environmentId: 1,
                flows,
                performAction: false,
                deployMode: 'integration',
                logContextGetter,
                orchestrator: mockOrchestrator
            });

            expect(result).not.toBeNull();
            expect(result!.deletedSyncs.map((s) => s.name)).not.toContain('slack-sync');
        });
    });
});
