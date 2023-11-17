import { expect, describe, it, vi } from 'vitest';
import { IncomingFlowConfig, SyncConfigType } from '../../../models/Sync.js';
import environmentService from '../../environment.service.js';
import * as SyncConfigService from './config.service.js';
import * as SyncService from '../sync.service.js';
import * as DeployConfigService from './deploy.service.js';
import configService from '../../config.service.js';
import { mockAddEndTime, mockCreateActivityLog, mockUpdateSuccess } from '../../activity/mocks.js';
import { mockErrorManagerReport } from '../../../utils/error.manager.mocks.js';

describe('Sync config create', () => {
    const environment_id = 1;
    const debug = true;

    it('Create sync configs correctly', async () => {
        const environment_id = 1;
        const syncs: IncomingFlowConfig[] = [];
        const debug = true;

        vi.spyOn(environmentService, 'getAccountIdFromEnvironment').mockImplementation(() => {
            return Promise.resolve(1);
        });

        mockCreateActivityLog();
        mockUpdateSuccess();
        mockAddEndTime();

        // empty sync config should return back an empty array
        const emptyConfig = await DeployConfigService.deploy(environment_id, syncs, '', debug);

        expect(emptyConfig).not.toBe([]);
    });

    it('Throws a provider not found error', async () => {
        const syncs = [
            {
                syncName: 'test-sync',
                type: SyncConfigType.SYNC,
                providerConfigKey: 'google-wrong',
                fileBody: {
                    js: 'integrations.js',
                    ts: 'integrations.ts'
                },
                models: ['Model_1', 'Model_2'],
                runs: 'every 6h',
                version: '1',
                model_schema: '[{ "name": "model", "fields": [{ "name": "some", "type": "value" }] }]'
            }
        ];

        vi.spyOn(configService, 'getProviderConfig').mockImplementation(() => {
            return Promise.resolve(null);
        });

        const { error } = await DeployConfigService.deploy(environment_id, syncs, '', debug);
        await expect(error?.message).toBe(
            `There is no Provider Configuration matching this key. Please make sure this value exists in the Nango dashboard {
  "providerConfigKey": "google-wrong"
}`
        );
    });

    it('Throws an error at the end of the create sync process', async () => {
        const syncs = [
            {
                syncName: 'test-sync',
                type: SyncConfigType.SYNC,
                providerConfigKey: 'google',
                fileBody: {
                    js: 'integrations.js',
                    ts: 'integrations.ts'
                },
                models: ['Model_1', 'Model_2'],
                runs: 'every 6h',
                version: '1',
                model_schema: '[{ "name": "model", "fields": [{ "name": "some", "type": "value" }] }]'
            }
        ];

        mockErrorManagerReport();

        vi.spyOn(configService, 'getProviderConfig').mockImplementation(() => {
            return Promise.resolve({
                id: 1,
                unique_key: 'google',
                provider: 'google',
                oauth_client_id: '123',
                oauth_client_secret: '123',
                environment_id: 1
            });
        });

        vi.spyOn(SyncConfigService, 'getSyncAndActionConfigsBySyncNameAndConfigId').mockImplementation(() => {
            return Promise.resolve([
                {
                    id: 1,
                    environment_id: 1,
                    sync_name: 'test-sync',
                    type: SyncConfigType.SYNC,
                    file_location: '/tmp/test-sync',
                    nango_config_id: 1,
                    models: ['Model_1', 'Model_2'],
                    model_schema: [{ name: 'model', fields: [{ name: 'some', type: 'value' }] }],
                    active: true,
                    runs: 'every 6h',
                    auto_start: true,
                    track_deletes: false,
                    version: '1'
                }
            ]);
        });

        vi.spyOn(SyncConfigService, 'getSyncConfigByParams').mockImplementation(() => {
            return Promise.resolve({
                id: 1,
                environment_id: 1,
                sync_name: 'test-sync',
                type: SyncConfigType.SYNC,
                file_location: '/tmp/test-sync',
                nango_config_id: 1,
                models: ['Model_1', 'Model_2'],
                model_schema: [{ name: 'model', fields: [{ name: 'some', type: 'value' }] }],
                active: true,
                runs: 'every 6h',
                auto_start: true,
                track_deletes: false,
                version: '1'
            });
        });

        vi.spyOn(SyncConfigService, 'getSyncAndActionConfigByParams').mockImplementation(() => {
            return Promise.resolve({
                id: 1,
                environment_id: 1,
                sync_name: 'test-sync',
                type: SyncConfigType.SYNC,
                file_location: '/tmp/test-sync',
                nango_config_id: 1,
                models: ['Model_1', 'Model_2'],
                model_schema: [{ name: 'model', fields: [{ name: 'some', type: 'value' }] }],
                active: true,
                runs: 'every 6h',
                auto_start: true,
                track_deletes: false,
                version: '1'
            });
        });

        vi.spyOn(SyncService, 'getSyncsByProviderConfigAndSyncName').mockImplementation(() => {
            return Promise.resolve([]);
        });

        await expect(DeployConfigService.deploy(environment_id, syncs, '', debug)).rejects.toThrowError(
            'Error creating sync config from a deploy. Please contact support with the sync name and connection details'
        );
    });
});
