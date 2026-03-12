import { afterEach, describe, expect, it, vi } from 'vitest';

import * as SyncConfigService from './config/config.service.js';
import syncManager from './manager.service.js';
import * as SyncService from './sync.service.js';
import connectionService from '../connection.service.js';

import type { Orchestrator } from '../../clients/orchestrator.js';
import type { SyncConfigWithProvider } from '../../models/Sync.js';
import type { LogContextGetter } from '@nangohq/logs';
import type { CLIDeployFlowConfig, SlimSync } from '@nangohq/types';

describe('getAndReconcileDifferences', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('deletes a disabled action even if a same-named sync remains deployed', async () => {
        const flows: CLIDeployFlowConfig[] = [
            {
                syncName: 'shared',
                type: 'sync',
                models: ['SharedSyncOutput'],
                runs: 'every day',
                auto_start: false,
                track_deletes: false,
                providerConfigKey: 'unauthenticated',
                input: 'SharedSyncInput',
                fileBody: { js: 'js file', ts: 'ts file' },
                endpoints: [{ method: 'GET', path: '/shared' }]
            }
        ];

        const existingSyncs: SyncConfigWithProvider[] = [
            {
                id: 1,
                sync_name: 'shared',
                runs: 'every day',
                models: ['SharedSyncOutput'],
                updated_at: new Date().toISOString(),
                provider_config_key: 'unauthenticated',
                unique_key: 'unauthenticated',
                type: 'sync'
            },
            {
                id: 2,
                sync_name: 'shared',
                runs: '',
                models: ['SharedActionOutput'],
                updated_at: new Date().toISOString(),
                provider_config_key: 'unauthenticated',
                unique_key: 'unauthenticated',
                type: 'action'
            }
        ];

        const providerSyncs: SlimSync[] = [{ id: 1, name: 'shared', providerConfigKey: 'unauthenticated', auto_start: false, enabled: true }];

        vi.spyOn(SyncConfigService, 'getSyncConfigsByProviderConfigKey').mockResolvedValue(providerSyncs);
        vi.spyOn(SyncConfigService, 'getActiveCustomSyncConfigsByEnvironmentId').mockResolvedValue(existingSyncs);
        vi.spyOn(connectionService, 'getConnectionsByEnvironmentAndConfig').mockResolvedValue([]);
        vi.spyOn(syncManager, 'createSyncs').mockResolvedValue(true);
        const deleteConfigSpy = vi.spyOn(syncManager, 'deleteConfig').mockResolvedValue();

        const result = await SyncService.getAndReconcileDifferences({
            environmentId: 1,
            flows,
            performAction: true,
            singleDeployMode: false,
            logContextGetter: {} as LogContextGetter,
            orchestrator: {} as Orchestrator
        });

        expect(result).not.toBeNull();
        expect(result?.updatedSyncs).toStrictEqual([
            {
                name: 'shared',
                providerConfigKey: 'unauthenticated',
                connections: 0,
                auto_start: false
            }
        ]);
        expect(result?.deletedActions).toStrictEqual([
            {
                name: 'shared',
                providerConfigKey: 'unauthenticated'
            }
        ]);
        expect(result?.deletedSyncs).toStrictEqual([]);
        expect(deleteConfigSpy).toHaveBeenCalledWith(2, 1);
    });
});
