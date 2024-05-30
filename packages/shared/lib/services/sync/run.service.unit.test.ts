import { expect, describe, it, vi } from 'vitest';
import type { SyncRunConfig } from './run.service.js';
import SyncRun from './run.service.js';
import environmentService from '../environment.service.js';
import LocalFileService from '../file/local.service.js';
import { SyncType } from '../../models/Sync.js';
import * as configService from './config/config.service.js';
import type { IntegrationServiceInterface } from '../../models/Sync.js';
import type { Environment } from '../../models/Environment.js';
import type { Account } from '../../models/Admin.js';
import { logContextGetter } from '@nangohq/logs';

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

const orchestratorClient = {
    executeAction: () => {
        return Promise.resolve({}) as any;
    },
    executeWebhook: () => {
        return Promise.resolve({}) as any;
    }
};

describe('SyncRun', () => {
    const dryRunConfig: SyncRunConfig = {
        integrationService: integrationService as unknown as IntegrationServiceInterface,
        recordsService,
        orchestratorClient,
        logContextGetter,
        writeToDb: false,
        nangoConnection: {
            id: 1,
            connection_id: '1234',
            provider_config_key: 'test_key',
            environment_id: 1
        },
        syncName: 'test_sync',
        syncType: SyncType.INCREMENTAL,
        syncId: 'some-sync',
        syncJobId: 123,
        debug: true
    };
    it('should initialize correctly', () => {
        const config: SyncRunConfig = {
            integrationService: integrationService as unknown as IntegrationServiceInterface,
            recordsService,
            orchestratorClient,
            logContextGetter,
            writeToDb: false,
            nangoConnection: {
                id: 1,
                connection_id: '1234',
                provider_config_key: 'test_key',
                environment_id: 1
            },
            syncName: 'test_sync',
            syncType: SyncType.INCREMENTAL,
            syncId: 'some-sync',
            syncJobId: 123,
            loadLocation: '/tmp',
            debug: true
        };

        const syncRun = new SyncRun(config);

        expect(syncRun).toBeTruthy();
        expect(syncRun.writeToDb).toEqual(false);
        expect(syncRun.nangoConnection.connection_id).toEqual('1234');
        expect(syncRun.syncName).toEqual('test_sync');
        expect(syncRun.syncType).toEqual(SyncType.INCREMENTAL);
        expect(syncRun.syncId).toEqual('some-sync');
        expect(syncRun.syncJobId).toEqual(123);
        expect(syncRun.activityLogId).toBeUndefined();
        expect(syncRun.loadLocation).toEqual('/tmp');
        expect(syncRun.debug).toEqual(true);
    });

    it('should mock the run method in dry run mode with different fail and success conditions', async () => {
        const syncRun = new SyncRun(dryRunConfig);

        vi.spyOn(environmentService, 'getAccountAndEnvironment').mockImplementation(() => {
            return Promise.resolve({
                account: {
                    id: 1,
                    name: 'test',
                    uuid: '1234'
                } as Account,
                environment: {
                    id: 1,
                    name: 'test',
                    secret_key: 'secret'
                } as Environment
            });
        });

        vi.spyOn(configService, 'getSyncConfig').mockImplementation(() => {
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

        // @ts-expect-error - if run script returns null then fail
        vi.spyOn(integrationService, 'runScript').mockImplementation(() => {
            return Promise.resolve(null);
        });

        const { response } = await syncRun.run();

        expect(response).toEqual(false);
    });
});
