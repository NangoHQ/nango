import { expect, describe, it, vi } from 'vitest';
import SyncRun from './run.service.js';
import * as ConfigService from './config/config.service.js';
import environmentService from '../environment.service.js';
import LocalFileService from '../file/local.service.js';
import { IntegrationServiceInterface, SyncType } from '../../models/Sync.js';
import type { Environment } from '../../models/Environment.js';

class integrationServiceMock implements IntegrationServiceInterface {
    async runScript() {
        return {
            success: true
        };
    }
    async cancelScript() {
        return;
    }
}

const integrationService = new integrationServiceMock();

const dryRunConfig = {
    integrationService: integrationService as unknown as IntegrationServiceInterface,
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

describe('SyncRun', () => {
    it('should initialize correctly', () => {
        const config = {
            integrationService: integrationService as unknown as IntegrationServiceInterface,
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

    it('should mock the run method in dry run mode with different fail and success conditions', async () => {
        const syncRun = new SyncRun(dryRunConfig);

        vi.spyOn(environmentService, 'getById').mockImplementation(() => {
            return Promise.resolve({
                id: 1,
                name: 'test',
                account_id: 1,
                secret_key: '1234'
            } as Environment);
        });

        vi.spyOn(ConfigService, 'getSyncConfig').mockImplementation(() => {
            return Promise.resolve({
                integrations: {
                    test_key: {
                        test_sync: {
                            runs: 'every 6h',
                            returns: ['Foo']
                        }
                    }
                },
                models: {
                    Foo: {
                        name: 'Foo'
                    }
                }
            });
        });

        vi.spyOn(LocalFileService, 'checkForIntegrationDistFile').mockImplementation(() => {
            return {
                result: true,
                path: '/tmp'
            };
        });

        vi.spyOn(integrationService, 'runScript').mockImplementation(() => {
            return Promise.resolve({
                success: true,
                response: { success: true }
            });
        });

        const run = await syncRun.run();

        expect(run).toEqual({ success: true });

        // if integration file not found it should return false
        vi.spyOn(LocalFileService, 'checkForIntegrationDistFile').mockImplementation(() => {
            return {
                result: false,
                path: '/tmp'
            };
        });

        const failRun = await syncRun.run();

        expect(failRun.response).toEqual(false);

        // if run script returns null then fail
        // @ts-ignore
        vi.spyOn(integrationService, 'runScript').mockImplementation(() => {
            return Promise.resolve(null);
        });

        const { response } = await syncRun.run();

        expect(response).toEqual(false);
    });
});
