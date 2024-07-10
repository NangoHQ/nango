import { expect, describe, it, vi } from 'vitest';
import type { SyncRunConfig } from './run.service.js';
import { SyncRunService } from './run.service.js';
import environmentService from '../environment.service.js';
import { SyncType } from '../../models/Sync.js';
import type { IntegrationServiceInterface, SyncConfig } from '../../models/Sync.js';
import { NangoError } from '../../utils/error.js';
import type { DBEnvironment, DBTeam } from '@nangohq/types';

class integrationServiceMock implements IntegrationServiceInterface {
    async runScript() {
        return Promise.resolve({
            success: true
        });
    }
    async cancelScript() {
        return Promise.resolve();
    }
}

const integrationService = new integrationServiceMock();
const recordsService = {
    markNonCurrentGenerationRecordsAsDeleted: ({
        connectionId: _connectionId,
        model: _model,
        syncId: _syncId,
        generation: _generation
    }: {
        connectionId: number;
        model: string;
        syncId: string;
        generation: number;
    }): Promise<string[]> => {
        return Promise.resolve([]);
    }
};

describe('SyncRun', () => {
    const dryRunConfig: SyncRunConfig = {
        integrationService: integrationService as unknown as IntegrationServiceInterface,
        recordsService,
        writeToDb: false,
        nangoConnection: {
            id: 1,
            connection_id: '1234',
            provider_config_key: 'test_key',
            environment_id: 1
        },
        syncConfig: {
            id: 0,
            sync_name: 'test_sync',
            file_location: '',
            models: [],
            track_deletes: false,
            type: 'sync',
            attributes: {},
            is_public: false,
            version: '0',
            active: true,
            auto_start: false,
            enabled: true,
            environment_id: 1,
            model_schema: [],
            nango_config_id: 1,
            runs: '',
            webhook_subscriptions: [],
            created_at: new Date(),
            updated_at: new Date()
        },
        syncType: SyncType.INCREMENTAL,
        syncId: 'some-sync',
        syncJobId: 123,
        debug: true,
        runnerFlags: {} as any
    };

    it('should initialize correctly', () => {
        const config: SyncRunConfig = {
            ...dryRunConfig,
            loadLocation: '/tmp'
        };

        const syncRun = new SyncRunService(config);

        expect(syncRun).toBeTruthy();
        expect(syncRun.writeToDb).toEqual(false);
        expect(syncRun.nangoConnection.connection_id).toEqual('1234');
        expect(syncRun.syncConfig.sync_name).toEqual('test_sync');
        expect(syncRun.syncType).toEqual(SyncType.INCREMENTAL);
        expect(syncRun.syncId).toEqual('some-sync');
        expect(syncRun.syncJobId).toEqual(123);
        expect(syncRun.activityLogId).toBeUndefined();
        expect(syncRun.loadLocation).toEqual('/tmp');
        expect(syncRun.debug).toEqual(true);
    });

    it('should fail if missing integration', async () => {
        const config: SyncRunConfig = {
            ...dryRunConfig,
            syncConfig: null as unknown as SyncConfig,
            loadLocation: '/tmp'
        };

        const syncRun = new SyncRunService(config);
        const run = await syncRun.run();

        expect(run).toEqual({ success: false, response: false, error: new NangoError('sync_script_failure', 'No configuration was found', 404) });
    });

    it('should succeed to run (mocked)', async () => {
        const syncRun = new SyncRunService(dryRunConfig);

        vi.spyOn(environmentService, 'getAccountAndEnvironment').mockImplementation(() => {
            return Promise.resolve({
                account: { id: 1, name: 'test', uuid: '1234' } as DBTeam,
                environment: { id: 1, name: 'test', secret_key: 'secret' } as DBEnvironment
            });
        });

        vi.spyOn(integrationService, 'runScript').mockImplementation(() => {
            return Promise.resolve({
                success: true,
                response: { success: true }
            });
        });

        const run = await syncRun.run();
        expect(run).toEqual({ success: true, error: null, response: { success: true } });
    });

    it('should failed to run (mocked)', async () => {
        const syncRun = new SyncRunService(dryRunConfig);

        vi.spyOn(environmentService, 'getAccountAndEnvironment').mockImplementation(() => {
            return Promise.resolve({
                account: { id: 1, name: 'test', uuid: '1234' } as DBTeam,
                environment: { id: 1, name: 'test', secret_key: 'secret' } as DBEnvironment
            });
        });

        vi.spyOn(integrationService, 'runScript').mockImplementation(() => {
            return Promise.resolve({
                success: false,
                response: { success: false }
            });
        });

        const failRun = await syncRun.run();
        expect(failRun.response).toEqual(false);
    });
});
