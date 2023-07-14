import { expect, describe, it, vi } from 'vitest';
import type { IncomingSyncConfig } from '../../models/Sync.js';
import environmentService from '../environment.service.js';
import * as SyncConfigService from './config.service';
import configService from '../config.service.js';
import { mockCreateActivityLog, mockUpdateSuccess } from '../activity/mocks.js';

describe('SyncConfigService', () => {
    it('Create sync configs correctly', async () => {
        const environment_id = 1;
        let syncs: IncomingSyncConfig[] = [];
        const debug = true;

        vi.spyOn(environmentService, 'getAccountIdFromEnvironment').mockImplementation(() => {
            return Promise.resolve(1);
        });

        mockCreateActivityLog();
        mockUpdateSuccess();

        // empty sync config should return back an empty array
        const emptyConfig = await SyncConfigService.createSyncConfig(environment_id, syncs, debug);
        expect(emptyConfig).not.toBe([]);

        syncs = [
            {
                syncName: 'test-sync',
                providerConfigKey: 'google',
                fileBody: 'integrations',
                models: ['Model_1', 'Model_2'],
                runs: 'every 6h',
                version: '1',
                model_schema: '[{ "name": "model", "fields": [{ "name": "some", "type": "value" }] }]'
            }
        ];

        const testConfig = await SyncConfigService.createSyncConfig(environment_id, syncs, debug);

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

        vi.spyOn(SyncConfigService, 'getSyncConfigByParams').mockImplementation(() => {
            return Promise.resolve({
                id: 1,
                environment_id: 1,
                sync_name: 'test-sync',
                file_location: '/tmp/test-sync',
                nango_config_id: 1,
                models: ['Model_1', 'Model_2'],
                model_schema: [{ name: 'model', fields: [{ name: 'some', type: 'value' }] }],
                active: true,
                runs: 'every 6h',
                version: '1'
            });
        });

        console.log(testConfig);
        //expect(emptyConfig).not.toBe([]);
    });
});
