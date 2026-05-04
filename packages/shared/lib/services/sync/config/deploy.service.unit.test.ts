import { describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import { logContextGetter } from '@nangohq/logs';

import * as SyncConfigService from './config.service.js';
import * as DeployConfigService from './deploy.service.js';
import { Orchestrator } from '../../../clients/orchestrator.js';
import { getTestTeam } from '../../../seeders/account.seeder.js';
import { getTestEnvironment } from '../../../seeders/environment.seeder.js';
import accountService from '../../account.service.js';
import configService from '../../config.service.js';
import remoteFileService from '../../file/remote.service.js';
import * as SyncService from '../sync.service.js';

import type { OrchestratorClientInterface } from '../../../clients/orchestrator.js';
import type { CleanedIncomingFlowConfig, DBSyncConfig, DBTeam } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

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

        vi.spyOn(accountService, 'getAccountFromEnvironment').mockImplementation(() => {
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
            sdkVersion: '0.0.0-yaml',
            onEventScriptsByProvider: [],
            source: 'repo'
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
            flows: syncs,
            nangoYamlBody: '',
            logContextGetter,
            orchestrator: mockOrchestrator,
            debug,
            sdkVersion: '0.0.0-yaml',
            onEventScriptsByProvider: [],
            source: 'repo'
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
                forward_webhooks: true,
                shared_credentials_id: null
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
                    source: 'repo',
                    metadata: {},
                    input: null,
                    sync_type: 'full',
                    models_json_schema: null,
                    sdk_version: null,
                    features: [],
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
                source: 'repo',
                metadata: {},
                input: null,
                sync_type: 'full',
                models_json_schema: null,
                sdk_version: null,
                features: [],
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
                source: 'repo',
                metadata: {},
                input: null,
                sync_type: 'full',
                models_json_schema: null,
                sdk_version: null,
                features: [],
                created_at: new Date(),
                updated_at: new Date()
            });
        });

        vi.spyOn(SyncService, 'getSyncsByProviderConfigKey').mockImplementation(() => {
            return Promise.resolve([]);
        });

        vi.spyOn(db.knex, 'from').mockReturnValue({
            where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                    first: vi.fn().mockResolvedValue(null)
                })
            })
        } as any);
        vi.spyOn(db.knex, 'transaction').mockRejectedValue(new Error());

        await expect(
            DeployConfigService.deploy({
                environment,
                account,
                flows: syncs,
                nangoYamlBody: '',
                logContextGetter,
                orchestrator: mockOrchestrator,
                debug,
                sdkVersion: '0.0.0-yaml',
                onEventScriptsByProvider: [],
                source: 'repo'
            })
        ).rejects.toThrowError('Error creating sync config from a deploy. Please contact support with the sync name and connection details');
    });
});

describe('Sync config models_json_schema handling', () => {
    const environment = getTestEnvironment();
    const account = getTestTeam();

    const baseFlow: CleanedIncomingFlowConfig = {
        syncName: 'test-sync',
        type: 'sync',
        providerConfigKey: 'google',
        fileBody: { js: 'integrations.js', ts: 'integrations.ts' },
        models: ['Model_1'],
        runs: null,
        version: '1',
        track_deletes: false,
        endpoints: []
    };

    const mockProviderConfig = {
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
        forward_webhooks: true,
        shared_credentials_id: null
    };

    function setupInfrastructureMocks(capturedSyncConfigs: any[]) {
        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue(mockProviderConfig as any);
        vi.spyOn(SyncConfigService, 'getSyncAndActionConfigByParams').mockResolvedValue(null);
        vi.spyOn(remoteFileService, 'upload').mockResolvedValue('https://example.com/file.js' as any);
        vi.spyOn(db.knex, 'from').mockReturnValue({
            where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                    first: vi.fn().mockResolvedValue(null)
                })
            })
        } as any);
        vi.spyOn(db.knex, 'transaction').mockImplementation(async (callback: any) => {
            const mockTrx = {
                from: (_table: string) => ({
                    where: () => ({
                        select: () => Promise.resolve([]) // no stale configs by default
                    }),
                    update: () => ({ whereIn: () => Promise.resolve() }),
                    insert: (data: any) => {
                        capturedSyncConfigs.push(...(Array.isArray(data) ? data : [data]));
                        return { returning: () => Promise.resolve([{ id: 1 }]) };
                    }
                }),
                raw: () => Promise.resolve()
            };
            await callback(mockTrx);
        });
    }

    it('Uses flow.models_json_schema directly when provided (new format)', async () => {
        const capturedSyncConfigs: any[] = [];
        setupInfrastructureMocks(capturedSyncConfigs);

        const flowJsonSchema: JSONSchema7 = {
            definitions: {
                Model_1: { type: 'object', properties: { id: { type: 'string' } } }
            }
        };

        const { success, error } = await DeployConfigService.deploy({
            account,
            environment,
            flows: [{ ...baseFlow, models_json_schema: flowJsonSchema }],
            nangoYamlBody: '',
            logContextGetter,
            orchestrator: mockOrchestrator,
            sdkVersion: '0.0.0-yaml',
            source: 'repo'
        });

        expect(success).toBe(true);
        expect(error).toBeNull();
        expect(capturedSyncConfigs).toHaveLength(1);
        expect(capturedSyncConfigs[0].models_json_schema).toEqual(flowJsonSchema);
    });

    it('Filters aggregatedJsonSchema for the flow models (legacy format)', async () => {
        const capturedSyncConfigs: any[] = [];
        setupInfrastructureMocks(capturedSyncConfigs);

        const aggregatedJsonSchema: JSONSchema7 = {
            definitions: {
                Model_1: { type: 'object', properties: { id: { type: 'string' } } },
                Model_2: { type: 'object', properties: { name: { type: 'string' } } }
            }
        };

        const { success, error } = await DeployConfigService.deploy({
            account,
            environment,
            flows: [baseFlow], // models: ['Model_1'], no models_json_schema
            aggregatedJsonSchema,
            nangoYamlBody: '',
            logContextGetter,
            orchestrator: mockOrchestrator,
            sdkVersion: '0.0.0-yaml',
            source: 'repo'
        });

        expect(success).toBe(true);
        expect(error).toBeNull();
        expect(capturedSyncConfigs).toHaveLength(1);
        // Only Model_1 should be present, Model_2 filtered out
        expect(capturedSyncConfigs[0].models_json_schema).toEqual({
            definitions: {
                Model_1: { type: 'object', properties: { id: { type: 'string' } } }
            }
        });
    });

    it('Returns an error when a model is missing from aggregatedJsonSchema (legacy format)', async () => {
        setupInfrastructureMocks([]);

        const aggregatedJsonSchema: JSONSchema7 = {
            definitions: {
                Other_Model: { type: 'object', properties: { id: { type: 'string' } } }
            }
        };

        const { success, error } = await DeployConfigService.deploy({
            account,
            environment,
            flows: [baseFlow], // models: ['Model_1'], not present in aggregatedJsonSchema
            aggregatedJsonSchema,
            nangoYamlBody: '',
            logContextGetter,
            orchestrator: mockOrchestrator,
            sdkVersion: '0.0.0-yaml',
            source: 'repo'
        });

        expect(success).toBe(false);
        expect(error?.type).toBe('deploy_missing_json_schema_model');
    });

    it('Sets models_json_schema to null when neither format provides a schema', async () => {
        const capturedSyncConfigs: any[] = [];
        setupInfrastructureMocks(capturedSyncConfigs);

        const { success, error } = await DeployConfigService.deploy({
            account,
            environment,
            flows: [baseFlow], // no models_json_schema, no aggregatedJsonSchema
            nangoYamlBody: '',
            logContextGetter,
            orchestrator: mockOrchestrator,
            sdkVersion: '0.0.0-yaml',
            source: 'repo'
        });

        expect(success).toBe(true);
        expect(error).toBeNull();
        expect(capturedSyncConfigs).toHaveLength(1);
        expect(capturedSyncConfigs[0].models_json_schema).toBeNull();
    });
});

describe('Deploy transaction - FOR UPDATE prevents duplicate active configs', () => {
    const environment = getTestEnvironment();
    const account = getTestTeam();

    const flow: CleanedIncomingFlowConfig = {
        syncName: 'contacts',
        type: 'sync',
        providerConfigKey: 'google',
        fileBody: { js: 'console.log("hi")', ts: 'export default {}' },
        models: ['Contact'],
        runs: null,
        version: '1',
        track_deletes: false,
        endpoints: []
    };

    const mockProviderConfig = {
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
        forward_webhooks: true,
        shared_credentials_id: null
    };

    const mockExistingConfig: DBSyncConfig = {
        id: 99,
        environment_id: 1,
        sync_name: 'contacts',
        type: 'sync',
        file_location: '/tmp/contacts',
        nango_config_id: 1,
        models: ['Contact'],
        model_schema: [],
        active: true,
        runs: null,
        auto_start: true,
        track_deletes: false,
        version: '1',
        enabled: true,
        webhook_subscriptions: null,
        attributes: {},
        source: 'repo',
        metadata: {},
        input: null,
        sync_type: 'full',
        models_json_schema: null,
        sdk_version: null,
        features: [],
        created_at: new Date(),
        updated_at: new Date(),
        deleted: false,
        pre_built: false,
        is_public: false
    };

    function mockDbKnexActiveConfig(activeConfig: DBSyncConfig | null = null) {
        vi.spyOn(db.knex, 'from').mockReturnValue({
            where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                    first: vi.fn().mockResolvedValue(activeConfig)
                })
            })
        } as any);
    }

    function buildMockTrx({ staleIds = [] as number[], capturedInserts = [] as any[] } = {}) {
        const selectSpy = vi.fn().mockResolvedValue(staleIds.map((id) => ({ id })));
        const whereInSpy = vi.fn().mockResolvedValue(undefined);

        const mockTrx = {
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({ select: selectSpy }),
                update: vi.fn().mockReturnValue({ whereIn: whereInSpy }),
                insert: vi.fn().mockImplementation((data: any) => {
                    capturedInserts.push(...(Array.isArray(data) ? data : [data]));
                    return { returning: vi.fn().mockResolvedValue([{ id: 100 }]) };
                })
            }),
            raw: vi.fn().mockResolvedValue(undefined)
        };

        return { mockTrx, selectSpy, whereInSpy };
    }

    it('acquires an advisory lock inside the transaction to serialize concurrent deploys', async () => {
        const { mockTrx } = buildMockTrx();
        mockDbKnexActiveConfig(null);

        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue(mockProviderConfig as any);
        vi.spyOn(SyncConfigService, 'getSyncAndActionConfigByParams').mockResolvedValue(null);
        vi.spyOn(SyncService, 'getSyncsByProviderConfigKey').mockResolvedValue([]);
        vi.spyOn(remoteFileService, 'upload').mockResolvedValue('https://example.com/file.js' as any);
        vi.spyOn(db.knex, 'transaction').mockImplementation((callback: any) => callback(mockTrx));

        const { success } = await DeployConfigService.deploy({
            account,
            environment,
            flows: [flow],
            nangoYamlBody: '',
            logContextGetter,
            orchestrator: mockOrchestrator,
            sdkVersion: '0.0.0',
            source: 'repo'
        });

        expect(success).toBe(true);
        expect(mockTrx.raw).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(?)', [expect.any(Number)]);
    });

    it('marks previously active config IDs as inactive when found inside the transaction', async () => {
        const { mockTrx, whereInSpy } = buildMockTrx({ staleIds: [42, 43] });
        mockDbKnexActiveConfig(null);

        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue(mockProviderConfig as any);
        vi.spyOn(SyncConfigService, 'getSyncAndActionConfigByParams').mockResolvedValue(mockExistingConfig);
        vi.spyOn(SyncService, 'getSyncsByProviderConfigKey').mockResolvedValue([]);
        vi.spyOn(remoteFileService, 'upload').mockResolvedValue('https://example.com/file.js' as any);
        vi.spyOn(db.knex, 'transaction').mockImplementation((callback: any) => callback(mockTrx));

        await DeployConfigService.deploy({
            account,
            environment,
            flows: [flow],
            nangoYamlBody: '',
            logContextGetter,
            orchestrator: mockOrchestrator,
            sdkVersion: '0.0.0',
            source: 'repo'
        });

        expect(whereInSpy).toHaveBeenCalledWith('id', [42, 43]);
    });

    it('skips the inactive update when no stale configs are found inside the transaction', async () => {
        const { mockTrx, whereInSpy } = buildMockTrx({ staleIds: [] });
        mockDbKnexActiveConfig(null);

        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue(mockProviderConfig as any);
        vi.spyOn(SyncConfigService, 'getSyncAndActionConfigByParams').mockResolvedValue(null);
        vi.spyOn(SyncService, 'getSyncsByProviderConfigKey').mockResolvedValue([]);
        vi.spyOn(remoteFileService, 'upload').mockResolvedValue('https://example.com/file.js' as any);
        vi.spyOn(db.knex, 'transaction').mockImplementation((callback: any) => callback(mockTrx));

        await DeployConfigService.deploy({
            account,
            environment,
            flows: [flow],
            nangoYamlBody: '',
            logContextGetter,
            orchestrator: mockOrchestrator,
            sdkVersion: '0.0.0',
            source: 'repo'
        });

        expect(whereInSpy).not.toHaveBeenCalled();
    });

    it('queries with the correct keys to identify the right active config to replace', async () => {
        const { mockTrx } = buildMockTrx();
        const fromSpy = mockTrx.from;
        mockDbKnexActiveConfig(null);

        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue(mockProviderConfig as any);
        vi.spyOn(SyncConfigService, 'getSyncAndActionConfigByParams').mockResolvedValue(null);
        vi.spyOn(SyncService, 'getSyncsByProviderConfigKey').mockResolvedValue([]);
        vi.spyOn(remoteFileService, 'upload').mockResolvedValue('https://example.com/file.js' as any);
        vi.spyOn(db.knex, 'transaction').mockImplementation((callback: any) => callback(mockTrx));

        await DeployConfigService.deploy({
            account,
            environment,
            flows: [flow],
            nangoYamlBody: '',
            logContextGetter,
            orchestrator: mockOrchestrator,
            sdkVersion: '0.0.0',
            source: 'repo'
        });

        // The first from() call is the forUpdate query
        const whereCall = fromSpy.mock.results[0]!.value.where;
        expect(whereCall).toHaveBeenCalledWith(
            expect.objectContaining({
                sync_name: 'contacts',
                type: 'sync',
                nango_config_id: mockProviderConfig.id,
                active: true,
                deleted: false
            })
        );
    });

    it('preserves the enabled state from the previously deployed config', async () => {
        const capturedInserts: any[] = [];
        const { mockTrx } = buildMockTrx({ staleIds: [99], capturedInserts });
        mockDbKnexActiveConfig({ ...mockExistingConfig, enabled: false });

        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue(mockProviderConfig as any);
        vi.spyOn(SyncConfigService, 'getSyncAndActionConfigByParams').mockResolvedValue({ ...mockExistingConfig, enabled: false });
        vi.spyOn(SyncService, 'getSyncsByProviderConfigKey').mockResolvedValue([]);
        vi.spyOn(remoteFileService, 'upload').mockResolvedValue('https://example.com/file.js' as any);
        vi.spyOn(db.knex, 'transaction').mockImplementation((callback: any) => callback(mockTrx));

        const { success } = await DeployConfigService.deploy({
            account,
            environment,
            flows: [flow],
            nangoYamlBody: '',
            logContextGetter,
            orchestrator: mockOrchestrator,
            sdkVersion: '0.0.0',
            source: 'repo'
        });

        expect(success).toBe(true);
        expect(capturedInserts[0].enabled).toBe(false);
    });

    it('defaults enabled to true when there is no previous config', async () => {
        const capturedInserts: any[] = [];
        const { mockTrx } = buildMockTrx({ capturedInserts });
        mockDbKnexActiveConfig(null);

        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue(mockProviderConfig as any);
        vi.spyOn(SyncConfigService, 'getSyncAndActionConfigByParams').mockResolvedValue(null);
        vi.spyOn(SyncService, 'getSyncsByProviderConfigKey').mockResolvedValue([]);
        vi.spyOn(remoteFileService, 'upload').mockResolvedValue('https://example.com/file.js' as any);
        vi.spyOn(db.knex, 'transaction').mockImplementation((callback: any) => callback(mockTrx));

        await DeployConfigService.deploy({
            account,
            environment,
            flows: [flow],
            nangoYamlBody: '',
            logContextGetter,
            orchestrator: mockOrchestrator,
            sdkVersion: '0.0.0',
            source: 'repo'
        });

        expect(capturedInserts[0].enabled).toBe(true);
    });

    it('concurrent deploy: second deploy replaces the first deploy config, not the original', async () => {
        const DEPLOY_A_NEW_CONFIG_ID = 2296002;
        const capturedInserts: any[] = [];
        const whereInSpy = vi.fn().mockResolvedValue(undefined);

        const mockTrx = {
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    select: vi.fn().mockResolvedValue([{ id: DEPLOY_A_NEW_CONFIG_ID }])
                }),
                update: vi.fn().mockReturnValue({ whereIn: whereInSpy }),
                insert: vi.fn().mockImplementation((data: any) => {
                    capturedInserts.push(...(Array.isArray(data) ? data : [data]));
                    return { returning: vi.fn().mockResolvedValue([{ id: 2296580 }]) };
                })
            }),
            raw: vi.fn().mockResolvedValue(undefined)
        };
        mockDbKnexActiveConfig(null);

        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue(mockProviderConfig as any);
        vi.spyOn(SyncConfigService, 'getSyncAndActionConfigByParams').mockResolvedValue(mockExistingConfig);
        vi.spyOn(SyncService, 'getSyncsByProviderConfigKey').mockResolvedValue([]);
        vi.spyOn(remoteFileService, 'upload').mockResolvedValue('https://example.com/file.js' as any);
        vi.spyOn(db.knex, 'transaction').mockImplementation((callback: any) => callback(mockTrx));

        const { success } = await DeployConfigService.deploy({
            account,
            environment,
            flows: [flow],
            nangoYamlBody: '',
            logContextGetter,
            orchestrator: mockOrchestrator,
            sdkVersion: '0.0.0',
            source: 'repo'
        });

        expect(success).toBe(true);
        expect(whereInSpy).toHaveBeenCalledWith('id', [DEPLOY_A_NEW_CONFIG_ID]);
        expect(capturedInserts).toHaveLength(1);
    });
});
