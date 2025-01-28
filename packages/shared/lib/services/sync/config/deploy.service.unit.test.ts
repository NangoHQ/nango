import { expect, describe, it, vi } from 'vitest';
import environmentService from '../../environment.service.js';
import * as SyncConfigService from './config.service.js';
import * as SyncService from '../sync.service.js';
import * as DeployConfigService from './deploy.service.js';
import connectionService from '../../connection.service.js';
import configService from '../../config.service.js';
import { logContextGetter } from '@nangohq/logs';
import { Orchestrator } from '../../../clients/orchestrator.js';
import type { OrchestratorClientInterface } from '../../../clients/orchestrator.js';
import type { DBTeam, DBEnvironment, CleanedIncomingFlowConfig } from '@nangohq/types';
import type { SyncConfig } from '../../../models/Sync.js';
import db from '@nangohq/database';

const orchestratorClientNoop: OrchestratorClientInterface = {
    recurring: () => Promise.resolve({}) as any,
    executeAction: () => Promise.resolve({}) as any,
    executeWebhook: () => Promise.resolve({}) as any,
    executeOnEvent: () => Promise.resolve({}) as any,
    executeSync: () => Promise.resolve({}) as any,
    cancel: () => Promise.resolve({}) as any,
    pauseSync: () => Promise.resolve({}) as any,
    unpauseSync: () => Promise.resolve({}) as any,
    deleteSync: () => Promise.resolve({}) as any,
    updateSyncFrequency: () => Promise.resolve({}) as any,
    searchSchedules: () => Promise.resolve({}) as any
};
const mockOrchestrator = new Orchestrator(orchestratorClientNoop);

describe('Sync config create', () => {
    const environment = { id: 1, name: '' } as DBEnvironment;
    const account = { id: 1, name: '' } as DBTeam;
    const debug = true;

    it('Create sync configs correctly', async () => {
        const syncs: CleanedIncomingFlowConfig[] = [];
        const debug = true;

        vi.spyOn(environmentService, 'getAccountFromEnvironment').mockImplementation(() => {
            return Promise.resolve({ id: 1, name: '' } as DBTeam);
        });

        // empty sync config should return back an empty array
        const emptyConfig = await DeployConfigService.deploy({
            account,
            environment,
            flows: syncs,
            nangoYamlBody: '',
            logContextGetter,
            orchestrator: mockOrchestrator,
            debug,
            onEventScriptsByProvider: []
        });

        expect(emptyConfig).not.toBe([]);
    });

    it('Throws a provider not found error', async () => {
        const syncs: CleanedIncomingFlowConfig[] = [
            {
                syncName: 'test-sync',
                type: 'sync',
                providerConfigKey: 'google-wrong',
                fileBody: {
                    js: 'integrations.js',
                    ts: 'integrations.ts'
                },
                models: ['Model_1', 'Model_2'],
                runs: 'every 6h',
                version: '1',
                model_schema: '[{ "name": "model", "fields": [{ "name": "some", "type": "value" }] }]',
                track_deletes: true,
                endpoints: [
                    { method: 'GET', path: '/model1' },
                    { method: 'GET', path: '/model2' }
                ]
            }
        ];

        vi.spyOn(configService, 'getProviderConfig').mockImplementation(() => {
            return Promise.resolve(null);
        });

        const { error } = await DeployConfigService.deploy({
            account,
            environment,
            flows: syncs,
            nangoYamlBody: '',
            logContextGetter,
            orchestrator: mockOrchestrator,
            debug,
            onEventScriptsByProvider: []
        });
        expect(error?.message).toBe(
            `There is no Provider Configuration matching this key. Please make sure this value exists in the Nango dashboard {
  "providerConfigKey": "google-wrong"
}`
        );
    });

    it('Throws an error at the end of the create sync process', async () => {
        const syncs: CleanedIncomingFlowConfig[] = [
            {
                syncName: 'test-sync',
                type: 'sync',
                providerConfigKey: 'google',
                fileBody: {
                    js: 'integrations.js',
                    ts: 'integrations.ts'
                },
                models: ['Model_1', 'Model_2'],
                runs: 'every 6h',
                version: '1',
                model_schema: '[{ "name": "model", "fields": [{ "name": "some", "type": "value" }] }]',
                track_deletes: true,
                endpoints: [
                    { method: 'GET', path: '/model1' },
                    { method: 'GET', path: '/model2' }
                ]
            }
        ];

        vi.spyOn(configService, 'getProviderConfig').mockImplementation(() => {
            return Promise.resolve({
                id: 1,
                unique_key: 'google',
                provider: 'google',
                oauth_client_id: '123',
                oauth_client_secret: '123',
                post_connection_scripts: null,
                environment_id: 1,
                created_at: new Date(),
                updated_at: new Date(),
                missing_fields: []
            });
        });

        vi.spyOn(SyncConfigService, 'getSyncAndActionConfigsBySyncNameAndConfigId').mockImplementation(() => {
            return Promise.resolve([
                {
                    id: 1,
                    environment_id: 1,
                    sync_name: 'test-sync',
                    type: 'sync',
                    file_location: '/tmp/test-sync',
                    nango_config_id: 1,
                    models: ['Model_1', 'Model_2'],
                    model_schema: [{ name: 'model', fields: [{ name: 'some', type: 'value' }] }],
                    active: true,
                    runs: 'every 6h',
                    auto_start: true,
                    track_deletes: false,
                    version: '1',
                    enabled: true,
                    webhook_subscriptions: null
                }
            ] as SyncConfig[]);
        });

        vi.spyOn(SyncConfigService, 'getSyncConfigByParams').mockImplementation(() => {
            return Promise.resolve({
                id: 1,
                environment_id: 1,
                sync_name: 'test-sync',
                type: 'sync',
                file_location: '/tmp/test-sync',
                nango_config_id: 1,
                models: ['Model_1', 'Model_2'],
                model_schema: [{ name: 'model', fields: [{ name: 'some', type: 'value' }] }],
                active: true,
                runs: 'every 6h',
                auto_start: true,
                track_deletes: false,
                version: '1',
                enabled: true,
                webhook_subscriptions: null
            } as SyncConfig);
        });

        vi.spyOn(SyncConfigService, 'getSyncAndActionConfigByParams').mockImplementation(() => {
            return Promise.resolve({
                id: 1,
                environment_id: 1,
                sync_name: 'test-sync',
                type: 'sync',
                file_location: '/tmp/test-sync',
                nango_config_id: 1,
                models: ['Model_1', 'Model_2'],
                model_schema: [{ name: 'model', fields: [{ name: 'some', type: 'value' }] }],
                active: true,
                runs: 'every 6h',
                auto_start: true,
                track_deletes: false,
                version: '1',
                enabled: true,
                webhook_subscriptions: null
            } as SyncConfig);
        });

        vi.spyOn(connectionService, 'shouldCapUsage').mockImplementation(() => {
            return Promise.resolve(false);
        });

        vi.spyOn(SyncService, 'getSyncsByProviderConfigAndSyncName').mockImplementation(() => {
            return Promise.resolve([]);
        });

        vi.spyOn(db.knex, 'from').mockRejectedValue(new Error());

        await expect(
            DeployConfigService.deploy({
                environment,
                account,
                flows: syncs,
                nangoYamlBody: '',
                logContextGetter,
                orchestrator: mockOrchestrator,
                debug,
                onEventScriptsByProvider: []
            })
        ).rejects.toThrowError('Error creating sync config from a deploy. Please contact support with the sync name and connection details');
    });
});
