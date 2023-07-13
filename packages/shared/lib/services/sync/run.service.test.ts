import { expect, describe, it, vi } from 'vitest';
import SyncRun from './run.service.js';
import * as ConfigService from './config.service.js';
import environmentService from '../environment.service.js';
import * as NangoConfigService from '../nango-config.service.js';
import integationService from './integration.service.js';
import { SyncType } from '../../models/Sync.js';

describe('SyncRun', () => {
    it('should initialize correctly', () => {
        const config = {
            writeToDb: true,
            nangoConnection: {
                connection_id: '1234',
                provider_config_key: 'test_key',
                environment_id: 1
            },
            syncName: 'test_sync',
            syncType: SyncType.INCREMENTAL,
            syncId: 'some-sync',
            syncJobId: 123,
            activityLogId: 123,
            loadLocation: '/tmp',
            debug: true
        };

        const syncRun = new SyncRun(config);

        expect(syncRun).toBeTruthy();
        expect(syncRun.writeToDb).toEqual(true);
        expect(syncRun.nangoConnection.connection_id).toEqual('1234');
        expect(syncRun.syncName).toEqual('test_sync');
        expect(syncRun.syncType).toEqual(SyncType.INCREMENTAL);
        expect(syncRun.syncId).toEqual('some-sync');
        expect(syncRun.syncJobId).toEqual(123);
        expect(syncRun.activityLogId).toEqual(123);
        expect(syncRun.loadLocation).toEqual('/tmp');
        expect(syncRun.debug).toEqual(true);
    });

    it('should mock the run method in dry run mode', async () => {
        const config = {
            writeToDb: false,
            nangoConnection: {
                connection_id: '1234',
                provider_config_key: 'test_key',
                environment_id: 1
            },
            syncName: 'test_sync',
            syncType: SyncType.INCREMENTAL,
            syncId: 'some-sync',
            syncJobId: 123,
            activityLogId: 123,
            debug: true
        };

        const syncRun = new SyncRun(config);

        vi.spyOn(environmentService, 'getById').mockImplementation(() => {
            return {
                environment_id: 1,
                name: 'test',
                account_id: 1,
                secret_key: '1234'
            };
        });

        vi.spyOn(ConfigService, 'getSyncConfig').mockImplementation(() => {
            return {
                integrations: {
                    test_key: {
                        test_sync: {
                            runs: 'every 6h',
                            returns: 'Foo'
                        }
                    }
                },
                models: {
                    Foo: {
                        name: 'Foo'
                    }
                }
            };
        });

        vi.spyOn(NangoConfigService, 'checkForIntegrationFile').mockImplementation(() => {
            return {
                result: true,
                path: '/tmp'
            };
        });

        vi.spyOn(integationService, 'runScript').mockImplementation(() => {
            return {
                some: 'data'
            };
        });

        const run = await syncRun.run();

        expect(run).toEqual({ some: 'data' });
    });
});
