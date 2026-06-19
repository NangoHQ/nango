import { beforeEach, describe, expect, it, vi } from 'vitest';

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
import { onEventScriptService } from '../../on-event-scripts.service.js';
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
    deleteSyncs: () => Promise.resolve({}) as any,
    updateSyncFrequency: () => Promise.resolve({}) as any,
    searchSchedules: () => Promise.resolve({}) as any,
    getOutput: () => Promise.resolve({}) as any
};
const mockOrchestrator = new Orchestrator(orchestratorClientNoop);

const deployMockProviderConfig = {
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
const deployJsContent = 'compiled-js-content';
const deployTsContent = 'source-ts-content';
const deployJsLocalFileName = 'contacts-google.js';
const deployTsLocalFileName = 'google/syncs/contacts.ts';
const deployBaseFlow: CleanedIncomingFlowConfig = {
    syncName: 'contacts',
    type: 'sync',
    providerConfigKey: 'google',
    fileBody: { js: deployJsContent, ts: deployTsContent },
    models: ['Contact'],
    runs: null,
    version: '1',
    track_deletes: false,
    endpoints: []
};

function buildDeployExistingConfig(version: string): DBSyncConfig {
    return {
        id: 99,
        environment_id: 1,
        sync_name: 'contacts',
        type: 'sync',
        file_location: `dev/account/1/environment/1/config/1/contacts-v${version}.js`,
        nango_config_id: 1,
        models: ['Contact'],
        model_schema: [],
        active: true,
        runs: null,
        auto_start: true,
        track_deletes: false,
        version,
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
        deleted: false
    };
}

function setupDeployTestMocks({
    jsChanged,
    tsChanged = false,
    previousVersion = '1',
    captureSyncConfigs = false
}: {
    jsChanged: boolean;
    tsChanged?: boolean;
    previousVersion?: string;
    captureSyncConfigs?: boolean;
}) {
    const capturedSyncConfigs: Record<string, unknown>[] = [];
    const existingConfig = buildDeployExistingConfig(previousVersion);

    vi.spyOn(configService, 'getProviderConfig').mockResolvedValue(deployMockProviderConfig as any);
    vi.spyOn(SyncConfigService, 'getSyncAndActionConfigByParams').mockResolvedValue(existingConfig);
    vi.spyOn(SyncService, 'getSyncsByProviderConfigKey').mockResolvedValue([]);
    vi.spyOn(db.knex, 'from').mockReturnValue({
        where: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue([{ id: existingConfig.id, enabled: true }])
            })
        })
    } as any);
    vi.spyOn(db.knex, 'transaction').mockImplementation(async (callback: any) => {
        const mockTrx = {
            raw: vi.fn().mockResolvedValue(undefined),
            from: vi.fn().mockReturnValue({
                update: vi.fn().mockReturnValue({ whereIn: vi.fn().mockResolvedValue(undefined) }),
                insert: vi.fn().mockImplementation((data: unknown) => {
                    if (captureSyncConfigs) {
                        capturedSyncConfigs.push(...(Array.isArray(data) ? data : [data]));
                    }
                    return { returning: vi.fn().mockResolvedValue([{ id: 100 }]) };
                })
            })
        };
        await callback(mockTrx);
    });
    vi.spyOn(onEventScriptService, 'update').mockResolvedValue([]);

    vi.spyOn(remoteFileService, 'checkIfChanged').mockImplementation(({ objectKey }) => {
        return Promise.resolve(objectKey.endsWith('.ts') ? tsChanged : jsChanged);
    });

    const uploadSpy = vi.spyOn(remoteFileService, 'upload').mockResolvedValue(existingConfig.file_location as any);

    return { uploadSpy, capturedSyncConfigs };
}

async function deployTestFlow(flow: CleanedIncomingFlowConfig) {
    return DeployConfigService.deploy({
        account: getTestTeam(),
        environment: getTestEnvironment(),
        flows: [flow],
        nangoYamlBody: '',
        logContextGetter,
        orchestrator: mockOrchestrator,
        sdkVersion: '0.0.0',
        source: 'repo'
    });
}

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

    it('returns failure and marks logCtx as failed when file upload returns null', async () => {
        const syncs: CleanedIncomingFlowConfig[] = [
            {
                syncName: 'test-sync',
                type: 'sync',
                providerConfigKey: 'google',
                fileBody: { js: 'integrations.js', ts: 'integrations.ts' },
                models: ['Model_1'],
                runs: 'every 6h',
                version: '1',
                track_deletes: false,
                endpoints: []
            }
        ];

        const mockFailed = vi.fn().mockResolvedValue(undefined);
        vi.spyOn(logContextGetter, 'create').mockResolvedValue({
            failed: mockFailed,
            success: vi.fn().mockResolvedValue(undefined),
            error: vi.fn().mockResolvedValue(undefined),
            info: vi.fn().mockResolvedValue(undefined),
            debug: vi.fn().mockResolvedValue(undefined),
            enrichOperation: vi.fn().mockResolvedValue(undefined)
        } as any);

        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue({
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
        } as any);

        vi.spyOn(SyncConfigService, 'getSyncAndActionConfigByParams').mockResolvedValue(null);
        vi.spyOn(SyncService, 'getSyncsByProviderConfigKey').mockResolvedValue([]);
        vi.spyOn(db.knex, 'from').mockReturnValue({
            where: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                    orderBy: vi.fn().mockResolvedValue([])
                })
            })
        } as any);

        vi.spyOn(remoteFileService, 'upload').mockResolvedValue(null as any);

        const { success, error } = await DeployConfigService.deploy({
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

        expect(success).toBe(false);
        expect(error?.type).toBe('file_upload_error');
        expect(mockFailed).toHaveBeenCalledOnce();
    });

    it('uploads files for a new function when checkIfChanged returns false (orphaned S3 file from failed first deploy)', async () => {
        const syncs: CleanedIncomingFlowConfig[] = [
            {
                syncName: 'check-document-access',
                type: 'action',
                providerConfigKey: 'google',
                fileBody: { js: 'console.log("action")', ts: 'export default {}' },
                models: [],
                runs: null,
                version: '0.0.1',
                track_deletes: false,
                endpoints: []
            }
        ];

        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue({
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
        } as any);

        vi.spyOn(SyncConfigService, 'getSyncAndActionConfigByParams').mockResolvedValue(null);
        vi.spyOn(SyncService, 'getSyncsByProviderConfigKey').mockResolvedValue([]);
        vi.spyOn(db.knex, 'from').mockReturnValue({
            where: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                    orderBy: vi.fn().mockResolvedValue([])
                })
            })
        } as any);

        (remoteFileService as any).checkIfChanged = vi.fn().mockResolvedValue(false);

        const uploadSpy = vi.spyOn(remoteFileService, 'upload').mockResolvedValue('https://example.com/check-document-access-v0.0.1.js' as any);
        vi.spyOn(onEventScriptService, 'update').mockResolvedValue([]);

        vi.spyOn(db.knex, 'transaction').mockImplementation(async (callback: any) => {
            const mockTrx = {
                from: vi.fn().mockReturnValue({
                    update: vi.fn().mockReturnValue({ whereIn: vi.fn().mockResolvedValue(undefined) }),
                    insert: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 1 }]) })
                })
            };
            await callback(mockTrx);
        });

        const { success, error } = await DeployConfigService.deploy({
            account,
            environment,
            flows: syncs,
            nangoYamlBody: '',
            logContextGetter,
            orchestrator: mockOrchestrator,
            debug,
            sdkVersion: '0.0.0-zero',
            onEventScriptsByProvider: [],
            source: 'standalone'
        });

        expect(success).toBe(true);
        expect(error).toBeNull();
        expect(uploadSpy).toHaveBeenCalled();
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

        vi.spyOn(remoteFileService, 'upload').mockResolvedValue('https://example.com/file.js' as any);

        vi.spyOn(db.knex, 'from').mockReturnValue({
            where: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                    orderBy: vi.fn().mockResolvedValue([])
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
        vi.spyOn(remoteFileService, 'checkIfChanged').mockResolvedValue(true);
        vi.spyOn(remoteFileService, 'upload').mockResolvedValue('https://example.com/file.js' as any);
        vi.spyOn(db.knex, 'from').mockReturnValue({
            where: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                    orderBy: vi.fn().mockResolvedValue([])
                })
            })
        } as any);
        vi.spyOn(db.knex, 'transaction').mockImplementation(async (callback: any) => {
            const mockTrx = {
                from: (_table: string) => ({
                    update: () => ({ whereIn: () => Promise.resolve() }),
                    insert: (data: any) => {
                        capturedSyncConfigs.push(...(Array.isArray(data) ? data : [data]));
                        return { returning: () => Promise.resolve([{ id: 1 }]) };
                    }
                })
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

describe('Deploy file upload and version resolution', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('file upload skip logic', () => {
        it('legacy - only js provided - js changed - js uploaded', async () => {
            const { uploadSpy } = setupDeployTestMocks({ jsChanged: true });

            await deployTestFlow({ ...deployBaseFlow, fileBody: deployJsContent as unknown as CleanedIncomingFlowConfig['fileBody'] });

            expect(uploadSpy).toHaveBeenCalledTimes(1);
            expect(uploadSpy).toHaveBeenCalledWith({
                content: deployJsContent,
                destinationPath: expect.stringContaining('contacts-v1.js'),
                destinationLocalFileName: deployJsLocalFileName
            });
        });

        it('legacy - only js provided - js not changed - js not uploaded', async () => {
            const { uploadSpy } = setupDeployTestMocks({ jsChanged: false });

            await deployTestFlow({ ...deployBaseFlow, fileBody: deployJsContent as unknown as CleanedIncomingFlowConfig['fileBody'] });

            expect(uploadSpy).not.toHaveBeenCalled();
        });

        it('both js and ts provided - neither changed - neither uploaded', async () => {
            const { uploadSpy } = setupDeployTestMocks({ jsChanged: false, tsChanged: false });

            await deployTestFlow(deployBaseFlow);

            expect(uploadSpy).not.toHaveBeenCalled();
        });

        it('both js and ts provided - js changed - both uploaded', async () => {
            const { uploadSpy } = setupDeployTestMocks({ jsChanged: true, tsChanged: false });

            await deployTestFlow(deployBaseFlow);

            expect(uploadSpy).toHaveBeenCalledTimes(2);
            expect(uploadSpy).toHaveBeenCalledWith({
                content: deployJsContent,
                destinationPath: expect.stringContaining('contacts-v1.js'),
                destinationLocalFileName: deployJsLocalFileName
            });
            expect(uploadSpy).toHaveBeenCalledWith({
                content: deployTsContent,
                destinationPath: expect.stringContaining('contacts.ts'),
                destinationLocalFileName: deployTsLocalFileName
            });
        });

        it('both js and ts provided - ts changed - both uploaded', async () => {
            const { uploadSpy } = setupDeployTestMocks({ jsChanged: false, tsChanged: true });

            await deployTestFlow(deployBaseFlow);

            expect(uploadSpy).toHaveBeenCalledTimes(2);
            expect(uploadSpy).toHaveBeenCalledWith({
                content: deployJsContent,
                destinationPath: expect.stringContaining('contacts-v1.js'),
                destinationLocalFileName: deployJsLocalFileName
            });
            expect(uploadSpy).toHaveBeenCalledWith({
                content: deployTsContent,
                destinationPath: expect.stringContaining('contacts.ts'),
                destinationLocalFileName: deployTsLocalFileName
            });
        });

        it('both js and ts provided - both changed - both uploaded', async () => {
            const { uploadSpy } = setupDeployTestMocks({ jsChanged: true, tsChanged: true });

            await deployTestFlow(deployBaseFlow);

            expect(uploadSpy).toHaveBeenCalledTimes(2);
            expect(uploadSpy).toHaveBeenCalledWith({
                content: deployJsContent,
                destinationPath: expect.stringContaining('contacts-v1.js'),
                destinationLocalFileName: deployJsLocalFileName
            });
            expect(uploadSpy).toHaveBeenCalledWith({
                content: deployTsContent,
                destinationPath: expect.stringContaining('contacts.ts'),
                destinationLocalFileName: deployTsLocalFileName
            });
        });
    });

    describe('version resolution', () => {
        it.each([
            { previousVersion: '1', newVersion: '1', fileChanged: false, shouldUpload: false, expectedVersion: '1' },
            { previousVersion: '1', newVersion: '1', fileChanged: true, shouldUpload: true, expectedVersion: '1' },
            { previousVersion: '1', newVersion: '2', fileChanged: false, shouldUpload: true, expectedVersion: '2' },
            { previousVersion: '1', newVersion: '2', fileChanged: true, shouldUpload: true, expectedVersion: '2' },
            { previousVersion: '1', newVersion: '', fileChanged: false, shouldUpload: false, expectedVersion: '1' },
            { previousVersion: '1', newVersion: '', fileChanged: true, shouldUpload: true, expectedVersion: '2' }
        ])(
            'previous=$previousVersion new=$newVersion changed=$fileChanged → upload=$shouldUpload version=$expectedVersion',
            async ({ previousVersion, newVersion, fileChanged, shouldUpload, expectedVersion }) => {
                const { uploadSpy, capturedSyncConfigs } = setupDeployTestMocks({
                    previousVersion,
                    jsChanged: fileChanged,
                    tsChanged: fileChanged,
                    captureSyncConfigs: true
                });

                const { success } = await deployTestFlow({ ...deployBaseFlow, version: newVersion });

                expect(success).toBe(true);
                if (shouldUpload) {
                    expect(uploadSpy).toHaveBeenCalled();
                } else {
                    expect(uploadSpy).not.toHaveBeenCalled();
                }
                expect(capturedSyncConfigs).toHaveLength(1);
                expect(capturedSyncConfigs[0]?.['version']).toBe(expectedVersion);
            }
        );
    });
});

describe('Deploy transaction - queued deploys mark previous config inactive', () => {
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
        deleted: false
    };

    function mockDbKnexActiveConfig(activeConfig: DBSyncConfig | null = null) {
        const rows = activeConfig ? [activeConfig] : [];
        vi.spyOn(db.knex, 'from').mockReturnValue({
            where: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                    orderBy: vi.fn().mockResolvedValue(rows)
                })
            })
        } as any);
    }

    function buildMockTrx(capturedInserts: any[] = []) {
        const whereInSpy = vi.fn().mockResolvedValue(undefined);
        const mockTrx = {
            raw: vi.fn().mockResolvedValue(undefined),
            from: vi.fn().mockReturnValue({
                update: vi.fn().mockReturnValue({ whereIn: whereInSpy }),
                insert: vi.fn().mockImplementation((data: any) => {
                    capturedInserts.push(...(Array.isArray(data) ? data : [data]));
                    return { returning: vi.fn().mockResolvedValue([{ id: 100 }]) };
                })
            })
        };
        return { mockTrx, whereInSpy };
    }

    it('marks the previously active config ID as inactive in the transaction', async () => {
        const { mockTrx, whereInSpy } = buildMockTrx();
        mockDbKnexActiveConfig(mockExistingConfig); // activeConfig.id = 99

        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue(mockProviderConfig as any);
        vi.spyOn(SyncConfigService, 'getSyncAndActionConfigByParams').mockResolvedValue(mockExistingConfig);
        vi.spyOn(SyncService, 'getSyncsByProviderConfigKey').mockResolvedValue([]);
        vi.spyOn(remoteFileService, 'checkIfChanged').mockResolvedValue(true);
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

        expect(whereInSpy).toHaveBeenCalledWith('id', [99]);
    });

    it('skips the inactive update when there is no previously active config', async () => {
        const { mockTrx, whereInSpy } = buildMockTrx();
        mockDbKnexActiveConfig(null);

        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue(mockProviderConfig as any);
        vi.spyOn(SyncConfigService, 'getSyncAndActionConfigByParams').mockResolvedValue(null);
        vi.spyOn(SyncService, 'getSyncsByProviderConfigKey').mockResolvedValue([]);
        vi.spyOn(remoteFileService, 'checkIfChanged').mockResolvedValue(true);
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

    it('preserves the enabled state from the previously deployed config', async () => {
        const capturedInserts: any[] = [];
        const { mockTrx } = buildMockTrx(capturedInserts);
        mockDbKnexActiveConfig({ ...mockExistingConfig, enabled: false });

        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue(mockProviderConfig as any);
        vi.spyOn(SyncConfigService, 'getSyncAndActionConfigByParams').mockResolvedValue({ ...mockExistingConfig, enabled: false });
        vi.spyOn(SyncService, 'getSyncsByProviderConfigKey').mockResolvedValue([]);
        vi.spyOn(remoteFileService, 'checkIfChanged').mockResolvedValue(true);
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
        const { mockTrx } = buildMockTrx(capturedInserts);
        mockDbKnexActiveConfig(null);

        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue(mockProviderConfig as any);
        vi.spyOn(SyncConfigService, 'getSyncAndActionConfigByParams').mockResolvedValue(null);
        vi.spyOn(SyncService, 'getSyncsByProviderConfigKey').mockResolvedValue([]);
        vi.spyOn(remoteFileService, 'checkIfChanged').mockResolvedValue(true);
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
});
