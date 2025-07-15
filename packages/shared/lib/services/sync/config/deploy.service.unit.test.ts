import { describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import { logContextGetter } from '@nangohq/logs';

import * as SyncConfigService from './config.service.js';
import { Orchestrator } from '../../../clients/orchestrator.js';
import { getTestTeam } from '../../../seeders/account.seeder.js';
import { getTestEnvironment } from '../../../seeders/environment.seeder.js';
import configService from '../../config.service.js';
import environmentService from '../../environment.service.js';
import * as SyncService from '../sync.service.js';
import * as DeployConfigService from './deploy.service.js';
import connectionService from '../../connection.service.js';

import type { OrchestratorClientInterface } from '../../../clients/orchestrator.js';
import type { CleanedIncomingFlowConfig, DBTeam } from '@nangohq/types';

const orchestratorClientNoop: OrchestratorClientInterface = {
    recurring: () => Promise.resolve({}) as any,
    executeAction: () => Promise.resolve({}) as any,
    executeActionAsync: () => Promise.resolve({}) as any,
    executeWebhook: () => Promise.resolve({}) as any,
    executeOnEvent: () => Promise.resolve({}) as any,
    executeSync: () => Promise.resolve({}) as any,
    cancel: () => Promise.resolve({}) as any,
    pauseSync: () => Promise.resolve({}) as any,
    unpauseSync: () => Promise.resolve({}) as any,
    deleteSync: () => Promise.resolve({}) as any,
    updateSyncFrequency: () => Promise.resolve({}) as any,
    searchSchedules: () => Promise.resolve({}) as any,
    getOutput: () => Promise.resolve({}) as any
};
const mockOrchestrator = new Orchestrator(orchestratorClientNoop);

describe('Sync config create', () => {
    const environment = getTestEnvironment();
    const account = getTestTeam();
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
            plan: null,
            flows: syncs,
            nangoYamlBody: '',
            logContextGetter,
            orchestrator: mockOrchestrator,
            debug,
            sdkVersion: '0.0.0-yaml',
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
            plan: null,
            flows: syncs,
            nangoYamlBody: '',
            logContextGetter,
            orchestrator: mockOrchestrator,
            debug,
            sdkVersion: '0.0.0-yaml',
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
                display_name: null,
                provider: 'google',
                oauth_client_id: '123',
                oauth_client_secret: '123',
                post_connection_scripts: null,
                environment_id: 1,
                created_at: new Date(),
                updated_at: new Date(),
                missing_fields: [],
                forward_webhooks: true
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
                    webhook_subscriptions: null,
                    attributes: {},
                    pre_built: false,
                    is_public: false,
                    metadata: {},
                    input: null,
                    sync_type: 'full',
                    models_json_schema: null,
                    sdk_version: null,
                    created_at: new Date(),
                    updated_at: new Date()
                }
            ]);
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
                webhook_subscriptions: null,
                attributes: {},
                pre_built: false,
                is_public: false,
                metadata: {},
                input: null,
                sync_type: 'full',
                models_json_schema: null,
                sdk_version: null,
                created_at: new Date(),
                updated_at: new Date()
            });
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
                webhook_subscriptions: null,
                attributes: {},
                pre_built: false,
                is_public: false,
                metadata: {},
                input: null,
                sync_type: 'full',
                models_json_schema: null,
                sdk_version: null,
                created_at: new Date(),
                updated_at: new Date()
            });
        });

        vi.spyOn(connectionService, 'shouldCapUsage').mockImplementation(() => {
            return Promise.resolve(false);
        });

        vi.spyOn(SyncService, 'getSyncsByProviderConfigKey').mockImplementation(() => {
            return Promise.resolve([]);
        });

        vi.spyOn(db.knex, 'from').mockRejectedValue(new Error());

        await expect(
            DeployConfigService.deploy({
                environment,
                account,
                plan: null,
                flows: syncs,
                nangoYamlBody: '',
                logContextGetter,
                orchestrator: mockOrchestrator,
                debug,
                sdkVersion: '0.0.0-yaml',
                onEventScriptsByProvider: []
            })
        ).rejects.toThrowError('Error creating sync config from a deploy. Please contact support with the sync name and connection details');
    });
});
