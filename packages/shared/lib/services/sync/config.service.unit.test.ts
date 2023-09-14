import { expect, describe, it, vi } from 'vitest';
import { IncomingSyncConfig, SyncConfigType } from '../../models/Sync.js';
import environmentService from '../environment.service.js';
import * as SyncConfigService from './config.service';
import configService from '../config.service.js';
import { mockAddEndTime, mockCreateActivityLog, mockUpdateSuccess } from '../activity/mocks.js';
import { mockErrorManagerReport } from '../../utils/error.manager.mocks.js';

describe('Sync config create', () => {
    const environment_id = 1;
    const debug = true;

    it('Create sync configs correctly', async () => {
        const environment_id = 1;
        const syncs: IncomingSyncConfig[] = [];
        const debug = true;

        vi.spyOn(environmentService, 'getAccountIdFromEnvironment').mockImplementation(() => {
            return Promise.resolve(1);
        });

        mockCreateActivityLog();
        mockUpdateSuccess();
        mockAddEndTime();

        // empty sync config should return back an empty array
        const emptyConfig = await SyncConfigService.createSyncConfig(environment_id, syncs, debug);

        expect(emptyConfig).not.toBe([]);
    });

    it('Throws a provider not found error', async () => {
        const syncs = [
            {
                syncName: 'test-sync',
                type: SyncConfigType.SYNC,
                providerConfigKey: 'google-wrong',
                fileBody: 'integrations',
                models: ['Model_1', 'Model_2'],
                runs: 'every 6h',
                version: '1',
                model_schema: '[{ "name": "model", "fields": [{ "name": "some", "type": "value" }] }]'
            }
        ];

        vi.spyOn(configService, 'getProviderConfig').mockImplementation(() => {
            return Promise.resolve(null);
        });

        const { error } = await SyncConfigService.createSyncConfig(environment_id, syncs, debug);
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
                fileBody: 'integrations',
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

        await expect(SyncConfigService.createSyncConfig(environment_id, syncs, debug)).rejects.toThrowError(
            'Error creating sync config from a deploy. Please contact support with the sync name and connection details'
        );
    });
});

describe('Sync config increment', () => {
    it('should increment a number', () => {
        expect(SyncConfigService.increment(1)).toBe(2);
        expect(SyncConfigService.increment(0)).toBe(1);
        expect(SyncConfigService.increment(9)).toBe(10);
    });

    it('should increment a string number', () => {
        expect(SyncConfigService.increment('1')).toBe('2');
        expect(SyncConfigService.increment('0')).toBe('1');
        expect(SyncConfigService.increment('999')).toBe('1000');
    });

    it('should increment version string', () => {
        expect(SyncConfigService.increment('1.9.9')).toBe('1.9.10');
        expect(SyncConfigService.increment('1.0.9')).toBe('1.0.10');
        expect(SyncConfigService.increment('1.1.1')).toBe('1.1.2');
        expect(SyncConfigService.increment('1.1.9')).toBe('1.1.10');
        expect(SyncConfigService.increment('1.1.9999')).toBe('1.1.10000');
        expect(SyncConfigService.increment('1.9.9')).toBe('1.9.10');
        expect(SyncConfigService.increment('99.2.2')).toBe('99.2.3');
        expect(SyncConfigService.increment('9.9.9')).toBe('9.9.10');
    });

    it('should throw error on invalid version segment', () => {
        expect(() => SyncConfigService.increment('1.1.a')).toThrowError('Invalid version string: 1.1.a');
        expect(() => SyncConfigService.increment('a.b.c')).toThrowError('Invalid version string: a.b.c');
    });

    it('should throw error on invalid input', () => {
        expect(() => SyncConfigService.increment({} as unknown as string)).toThrowError('Invalid version input: [object Object]');
        expect(() => SyncConfigService.increment(undefined as unknown as string)).toThrowError('Invalid version input: undefined');
    });
});
