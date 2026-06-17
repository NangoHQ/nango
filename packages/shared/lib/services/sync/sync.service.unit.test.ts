import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { Err, Ok } from '@nangohq/utils';

import configService from '../config.service.js';
import connectionService from '../connection.service.js';
import * as syncConfigService from './config/config.service.js';
import syncManager from './manager.service.js';
import { getAndReconcileDifferences } from './sync.service.js';
import * as syncService from './sync.service.js';
import { Orchestrator } from '../../clients/orchestrator.js';

import type { OrchestratorClientInterface } from '../../clients/orchestrator.js';
import type { Sync, SyncConfigWithProvider } from '../../models/Sync.js';
import type { CLIDeployFlowConfig, ConnectionInternal, DBSyncConfig } from '@nangohq/types';

const orchestratorClientNoop: OrchestratorClientInterface = {
    recurring: () => Promise.resolve({}) as any,
    executeAction: () => Promise.resolve({}) as any,
    executeActionAsync: () => Promise.resolve({}) as any,
    executeWebhook: () => Promise.resolve({}) as any,
    executeFunction: () => Promise.resolve({}) as any,
    executeOnEvent: () => Promise.resolve({}) as any,
    executeSync: () => Promise.resolve({}) as any,
    cancel: () => Promise.resolve({}) as any,
    pauseSync: () => Promise.resolve({}) as any,
    unpauseSync: () => Promise.resolve({}) as any,
    deleteSync: () => Promise.resolve({}) as any,
    deleteSyncs: () => Promise.resolve({}) as any,
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
        vi.spyOn(syncConfigService, 'getSyncConfigsByProviderConfigKey').mockResolvedValue([]);
        vi.spyOn(syncConfigService, 'getActionConfigByNameAndProviderConfigKey').mockResolvedValue(false);
        vi.spyOn(syncConfigService, 'getActiveCustomSyncConfigsByEnvironmentId').mockResolvedValue([]);
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
            vi.spyOn(syncConfigService, 'getActiveCustomSyncConfigsByEnvironmentId').mockResolvedValue([existingSync]);

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
            vi.spyOn(syncConfigService, 'getActiveCustomSyncConfigsByEnvironmentId').mockResolvedValue([existingSync]);
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
            vi.spyOn(syncConfigService, 'getActiveCustomSyncConfigsByEnvironmentId').mockResolvedValue(existingSyncs);

            // Only deploying a github sync; slack sync should be detected as deleted
            const flows: CLIDeployFlowConfig[] = [makeFlow({ syncName: 'old-sync-github', providerConfigKey: 'github' })];
            vi.spyOn(syncConfigService, 'getSyncConfigsByProviderConfigKey').mockResolvedValue([{ name: 'old-sync-github', enabled: true } as any]);

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
            vi.spyOn(syncConfigService, 'getActiveCustomSyncConfigsByEnvironmentId').mockResolvedValue([existingSync]);

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

        it('fails reconciliation (returns null) when a function-deletion teardown fails to enqueue', async () => {
            const existingSync = makeSyncConfig({ sync_name: 'removed-sync', unique_key: 'github' });
            vi.spyOn(syncConfigService, 'getActiveCustomSyncConfigsByEnvironmentId').mockResolvedValue([existingSync]);
            const onFunctionDeleted = vi.fn().mockResolvedValue(Err(new Error('queue down')));

            const result = await getAndReconcileDifferences({
                environmentId: 1,
                flows: [makeFlow({ syncName: 'new-sync', providerConfigKey: 'github' })],
                performAction: true,
                deployMode: 'all',
                logContextGetter,
                orchestrator: mockOrchestrator,
                onFunctionDeleted
            });

            expect(onFunctionDeleted).toHaveBeenCalledWith({ syncConfigId: existingSync.id, models: existingSync.models });
            expect(result).toBeNull();
        });

        it('continues when the teardown enqueues successfully', async () => {
            const existingSync = makeSyncConfig({ sync_name: 'removed-sync', unique_key: 'github' });
            vi.spyOn(syncConfigService, 'getActiveCustomSyncConfigsByEnvironmentId').mockResolvedValue([existingSync]);
            const onFunctionDeleted = vi.fn().mockResolvedValue(Ok(undefined));

            const result = await getAndReconcileDifferences({
                environmentId: 1,
                flows: [makeFlow({ syncName: 'new-sync', providerConfigKey: 'github' })],
                performAction: true,
                deployMode: 'all',
                logContextGetter,
                orchestrator: mockOrchestrator,
                onFunctionDeleted
            });

            expect(onFunctionDeleted).toHaveBeenCalled();
            expect(result).not.toBeNull();
        });
    });

    describe('mode: integration', () => {
        it('should only detect deleted syncs for the integration scope inferred from flows', async () => {
            const existingSyncs = [
                makeSyncConfig({ id: 1, sync_name: 'old-sync-github', unique_key: 'github' }),
                makeSyncConfig({ id: 2, sync_name: 'old-sync-slack', unique_key: 'slack' })
            ];
            vi.spyOn(syncConfigService, 'getActiveCustomSyncConfigsByEnvironmentId').mockResolvedValue(existingSyncs);

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
            vi.spyOn(syncConfigService, 'getActiveCustomSyncConfigsByEnvironmentId').mockResolvedValue(existingSyncs);

            // Deploying only to 'github'
            const flows: CLIDeployFlowConfig[] = [makeFlow({ syncName: 'github-sync', providerConfigKey: 'github' })];
            vi.spyOn(syncConfigService, 'getSyncConfigsByProviderConfigKey').mockResolvedValue([{ name: 'github-sync', enabled: true } as any]);

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

function makeConnection(overrides: Partial<ConnectionInternal> = {}): ConnectionInternal {
    return {
        id: 1,
        connection_id: 'conn-1',
        provider_config_key: 'github',
        environment_id: 1,
        connection_config: {},
        ...overrides
    };
}

function makeDbSyncConfig(overrides: Partial<DBSyncConfig> = {}): DBSyncConfig {
    return {
        id: 1,
        sync_name: 'my-sync',
        nango_config_id: 1,
        file_location: '/tmp/my-sync.js',
        version: '1',
        models: ['MyModel'],
        active: true,
        runs: 'every 1h',
        environment_id: 1,
        track_deletes: false,
        type: 'sync',
        auto_start: true,
        attributes: {},
        source: 'repo',
        metadata: {} as any,
        input: null,
        sync_type: 'full',
        webhook_subscriptions: null,
        enabled: true,
        models_json_schema: null,
        sdk_version: null,
        features: [],
        created_at: new Date(),
        updated_at: new Date(),
        deleted: false,
        deleted_at: null,
        ...overrides
    };
}

function makeExistingSync(overrides: Partial<Sync> = {}): Sync {
    return {
        id: 'sync-uuid-1',
        nango_connection_id: 1,
        name: 'my-sync',
        variant: 'base',
        frequency: null,
        last_sync_date: null,
        sync_config_id: 1,
        created_at: new Date(),
        updated_at: new Date(),
        deleted: false,
        deleted_at: null,
        ...overrides
    };
}

describe('createSyncForConnection — auto_start respected on reauth', () => {
    let unpauseSyncSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        unpauseSyncSpy = vi.spyOn(mockOrchestrator, 'unpauseSync').mockResolvedValue(Ok(undefined) as any);

        vi.spyOn(connectionService, 'getConnectionById').mockResolvedValue({
            ...makeConnection(),
            provider_config_key: 'github',
            environment_id: 1
        } as any);

        vi.spyOn(syncConfigService, 'getSyncConfig').mockResolvedValue({
            integrations: {
                github: {
                    'my-sync': {
                        sync_config_id: 1,
                        runs: 'every 1h',
                        type: 'sync',
                        returns: ['MyModel'],
                        input: undefined,
                        track_deletes: false,
                        auto_start: false,
                        attributes: {},
                        fileLocation: '/tmp/my-sync.js',
                        version: '1',
                        metadata: {} as any,
                        enabled: true
                    }
                }
            },
            models: {}
        } as any);

        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue({ id: 1, unique_key: 'github', provider: 'github' } as any);
        vi.spyOn(syncConfigService, 'getSyncConfigByParams').mockResolvedValue(makeDbSyncConfig());
        vi.spyOn(syncService, 'createSync').mockResolvedValue(null);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('does not unpause an existing sync when auto_start is false', async () => {
        vi.spyOn(syncService, 'undeleteSync').mockResolvedValue(Ok(makeExistingSync()));

        await syncManager.createSyncForConnection({
            connectionId: 1,
            syncVariant: 'base',
            logContextGetter,
            orchestrator: mockOrchestrator
        });

        expect(unpauseSyncSpy).not.toHaveBeenCalled();
    });

    it('unpauses an existing sync when auto_start is true', async () => {
        vi.spyOn(syncConfigService, 'getSyncConfig').mockResolvedValue({
            integrations: {
                github: {
                    'my-sync': {
                        sync_config_id: 1,
                        runs: 'every 1h',
                        type: 'sync',
                        returns: ['MyModel'],
                        input: undefined,
                        track_deletes: false,
                        auto_start: true,
                        attributes: {},
                        fileLocation: '/tmp/my-sync.js',
                        version: '1',
                        metadata: {} as any,
                        enabled: true
                    }
                }
            },
            models: {}
        } as any);
        vi.spyOn(syncService, 'undeleteSync').mockResolvedValue(Ok(makeExistingSync()));

        await syncManager.createSyncForConnection({
            connectionId: 1,
            syncVariant: 'base',
            logContextGetter,
            orchestrator: mockOrchestrator
        });

        expect(unpauseSyncSpy).toHaveBeenCalledWith({ syncId: 'sync-uuid-1', environmentId: 1 });
    });
});

describe('createSyncForConnections — auto_start respected on deploy', () => {
    let unpauseSyncSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        unpauseSyncSpy = vi.spyOn(mockOrchestrator, 'unpauseSync').mockResolvedValue(Ok(undefined) as any);
        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue({ id: 1, unique_key: 'github', provider: 'github' } as any);
        vi.spyOn(syncConfigService, 'getSyncConfigByParams').mockResolvedValue(makeDbSyncConfig());
        vi.spyOn(syncService, 'createSync').mockResolvedValue(null);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('does not unpause an existing sync when auto_start is false', async () => {
        vi.spyOn(syncService, 'undeleteSync').mockResolvedValue(Ok(makeExistingSync()));

        await syncManager.createSyncForConnections({
            connections: [makeConnection()],
            syncName: 'my-sync',
            syncVariant: 'base',
            providerConfigKey: 'github',
            environmentId: 1,
            flowConfig: makeFlow({ auto_start: false }),
            logContextGetter,
            orchestrator: mockOrchestrator,
            debug: false
        });

        expect(unpauseSyncSpy).not.toHaveBeenCalled();
    });

    it('unpauses an existing sync when auto_start is true', async () => {
        vi.spyOn(syncService, 'undeleteSync').mockResolvedValue(Ok(makeExistingSync()));

        await syncManager.createSyncForConnections({
            connections: [makeConnection()],
            syncName: 'my-sync',
            syncVariant: 'base',
            providerConfigKey: 'github',
            environmentId: 1,
            flowConfig: makeFlow({ auto_start: true }),
            logContextGetter,
            orchestrator: mockOrchestrator,
            debug: false
        });

        expect(unpauseSyncSpy).toHaveBeenCalledWith({ syncId: 'sync-uuid-1', environmentId: 1 });
    });
});
