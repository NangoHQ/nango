import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import * as kvstore from '@nangohq/kvstore';
import { envs } from '@nangohq/logs';
import { getPlan, getSyncConfigsAsStandardConfig, onEventScriptService, seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../../utils/tests.js';

import type { DBCustomerKey, DBEnvironment, OnEventScriptsByProvider, PostDeploy } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/sync/deploy';

describe(`POST ${endpoint}`, () => {
    const logsEnabled = envs.NANGO_LOGS_ENABLED;

    beforeAll(async () => {
        api = await runServer();
        envs.NANGO_LOGS_ENABLED = false;
    });
    afterAll(() => {
        envs.NANGO_LOGS_ENABLED = logsEnabled;
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'POST',
            // @ts-expect-error don't care
            body: {}
        });

        shouldBeProtected(res);
    });

    it('should validate body', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: {
                // @ts-expect-error on purpose
                debug: 'er'
            }
        });

        isError(res.json);

        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_body',
                errors: [
                    { code: 'invalid_type', message: 'Invalid input: expected array, received undefined', path: ['flowConfigs'] },
                    { code: 'invalid_type', message: 'Invalid input: expected boolean, received undefined', path: ['reconcile'] },
                    { code: 'invalid_type', message: 'Invalid input: expected boolean, received string', path: ['debug'] },
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['nangoYamlBody'] }
                ]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should reject a deploy carrying a nango.yaml body with a migration guide link', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: {
                debug: false,
                flowConfigs: [],
                nangoYamlBody: 'integrations:\n  google:\n    syncs: {}',
                reconcile: false,
                deployMode: 'all'
            }
        });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_body',
                errors: [
                    {
                        code: 'custom',
                        message:
                            'The `nango.yaml` configuration file is no longer supported. See the migration guide to Zero YAML: https://nango.dev/docs/guides/platform/migrations/migrate-to-zero-yaml',
                        path: ['nangoYamlBody']
                    }
                ]
            }
        });
    });

    it('should reject models_json_schema missing definitions for declared models', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: {
                debug: false,
                flowConfigs: [
                    {
                        syncName: 'test',
                        fileBody: { js: 'js file', ts: 'ts file' },
                        providerConfigKey: 'unauthenticated',
                        endpoints: [],
                        runs: 'every day',
                        type: 'sync',
                        track_deletes: false,
                        models: ['Output'],
                        input: 'Input',
                        models_json_schema: {
                            definitions: {
                                // Output and Input are missing
                                Unrelated: { type: 'object' }
                            }
                        }
                    }
                ],
                nangoYamlBody: '',
                reconcile: false,
                deployMode: 'all'
            }
        });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_body',
                errors: [
                    {
                        code: 'custom',
                        message: 'models_json_schema is missing definitions for some models or input',
                        path: ['flowConfigs', '0', 'models_json_schema']
                    }
                ]
            }
        });
    });

    it('should accept empty body', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: {
                debug: false,
                flowConfigs: [],
                nangoYamlBody: '',
                onEventScriptsByProvider: [],
                reconcile: false,
                deployMode: 'all',
                jsonSchema: { $comment: '', $schema: 'http://json-schema.org/draft-07/schema#', definitions: {} }
            }
        });

        isSuccess(res.json);

        expect(res.json).toStrictEqual<typeof res.json>([]);
        expect(res.res.status).toBe(200);
    });

    it('should return 409 when a concurrent deployment is already in progress', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const getLockingSpy = vi.spyOn(kvstore, 'getLocking').mockResolvedValue({
            tryAcquire: vi.fn(),
            release: vi.fn(),
            acquire: vi.fn().mockRejectedValue(new Error('Failed to acquire lock')),
            releaseAll: vi.fn(),
            hasLock: vi.fn()
        } as any);

        try {
            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: apiKey.secret,
                body: {
                    debug: false,
                    flowConfigs: [],
                    nangoYamlBody: '',
                    onEventScriptsByProvider: [],
                    reconcile: false,
                    deployMode: 'all'
                }
            });

            isError(res.json);
            expect(res.res.status).toBe(409);
            expect(res.json).toStrictEqual({
                error: {
                    code: 'concurrent_deployment',
                    message: 'A deployment is already in progress. Please wait for the current deployment to finish.',
                    payload: {}
                }
            });
        } finally {
            getLockingSpy.mockRestore();
        }
    });

    describe('deploy', () => {
        let env: DBEnvironment;
        let apiKey: DBCustomerKey;
        // This describe must be executed in order

        it('should deploy', async () => {
            const seed = await seeders.seedAccountEnvAndUser();
            env = seed.env;
            apiKey = seed.apiKey;
            await seeders.createConfigSeed(env, 'unauthenticated', 'unauthenticated');
            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: apiKey.secret,
                body: {
                    debug: false,
                    jsonSchema: {
                        $comment: '',
                        $schema: 'http://json-schema.org/draft-07/schema#',
                        definitions: {
                            Input: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'], additionalProperties: false },
                            Output: { type: 'object', properties: { ref: { $ref: '#/definitions/Ref' } }, required: ['ref'], additionalProperties: false },
                            Ref: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false }
                        }
                    },
                    flowConfigs: [
                        {
                            syncName: 'test',
                            fileBody: { js: 'js file', ts: 'ts file' },
                            providerConfigKey: 'unauthenticated',
                            endpoints: [{ method: 'GET', path: '/path' }],
                            runs: 'every day',
                            type: 'sync',
                            attributes: {},
                            auto_start: false,
                            metadata: { description: 'a' },
                            sync_type: 'full',
                            track_deletes: false,
                            input: 'Input',
                            models: ['Output']
                        }
                    ],
                    nangoYamlBody: ``,
                    onEventScriptsByProvider: [
                        {
                            providerConfigKey: 'unauthenticated',
                            scripts: [
                                {
                                    name: 'test',
                                    fileBody: { js: 'js file', ts: 'ts file' },
                                    event: 'post-connection-creation'
                                }
                            ]
                        }
                    ],
                    reconcile: false,
                    deployMode: 'all',
                    sdkVersion: '0.61.3-yaml'
                }
            });

            isSuccess(res.json);

            expect(res.json).toStrictEqual<typeof res.json>([
                { models: ['Output'], name: 'test', providerConfigKey: 'unauthenticated', type: 'sync', version: '1' },
                { models: [], name: 'test', providerConfigKey: 'unauthenticated', type: 'on-event', version: '0.0.1' }
            ]);
            expect(res.res.status).toBe(200);

            // Check that everything was inserted in DB
            const syncConfigs = await getSyncConfigsAsStandardConfig(env!.id);
            expect(syncConfigs).toHaveLength(1);
            expect(syncConfigs).toMatchObject([
                {
                    actions: [],
                    'on-events': [],
                    provider: 'unauthenticated',
                    providerConfigKey: 'unauthenticated',
                    syncs: [
                        {
                            id: expect.any(Number),
                            attributes: {},
                            auto_start: false,
                            description: 'a',
                            enabled: true,
                            endpoints: [{ method: 'GET', path: '/path', group: null }],
                            input: 'Input',
                            sdk_version: expect.any(String),
                            source: 'repo',
                            last_deployed: expect.toBeIsoDate(),
                            returns: ['Output'],
                            scopes: [],
                            runs: 'every day',
                            name: 'test',
                            sync_type: 'full',
                            track_deletes: false,
                            type: 'sync',
                            version: '1',
                            webhookSubscriptions: [],
                            features: [],
                            json_schema: {
                                definitions: {
                                    Input: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'], additionalProperties: false },
                                    Output: {
                                        type: 'object',
                                        properties: { ref: { $ref: '#/definitions/Ref' } },
                                        required: ['ref'],
                                        additionalProperties: false
                                    },
                                    Ref: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false }
                                }
                            },
                            models: [
                                { name: 'Output', fields: [] },
                                { name: 'Ref', fields: [] },
                                { name: 'Input', fields: [] }
                            ]
                        }
                    ]
                }
            ]);
        });

        it('should have removed syncs from DB', async () => {
            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: apiKey.secret,
                body: {
                    debug: false,
                    flowConfigs: [
                        {
                            syncName: 'test2',
                            fileBody: { js: 'js file', ts: 'ts file' },
                            providerConfigKey: 'unauthenticated',
                            endpoints: [{ method: 'GET', path: '/path2' }],
                            runs: 'every day',
                            type: 'sync',
                            attributes: {},
                            auto_start: false,
                            metadata: { description: 'b' },
                            sync_type: 'full',
                            track_deletes: false,
                            models: ['Output'],
                            models_json_schema: {
                                definitions: {
                                    Output: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false }
                                }
                            }
                        }
                    ],
                    nangoYamlBody: ``,
                    onEventScriptsByProvider: [],
                    reconcile: true,
                    deployMode: 'all',
                    sdkVersion: '0.61.3-yaml'
                }
            });
            isSuccess(res.json);

            expect(res.json).toStrictEqual<typeof res.json>([
                { models: ['Output'], name: 'test2', providerConfigKey: 'unauthenticated', type: 'sync', version: '1' }
            ]);
            expect(res.res.status).toBe(200);

            // 'test' sync should have been removed, only 'test2' remains
            const syncConfigs = await getSyncConfigsAsStandardConfig(env!.id);
            expect(syncConfigs).toHaveLength(1);
            expect(syncConfigs![0]!.syncs[0]!.name).toBe('test2');
        });
    });

    describe('reconciliation scope', () => {
        const flow = (providerConfigKey: string, syncName: string): PostDeploy['Body']['flowConfigs'][number] => ({
            syncName,
            fileBody: { js: 'js file', ts: 'ts file' },
            providerConfigKey,
            endpoints: [{ method: 'GET', path: `/${syncName}` }],
            runs: 'every day',
            type: 'sync',
            auto_start: false,
            track_deletes: false,
            models: [`${syncName}-model`],
            models_json_schema: { definitions: { [`${syncName}-model`]: { type: 'object' } } }
        });
        const onEvents = (providerConfigKey: string): OnEventScriptsByProvider => ({
            providerConfigKey,
            scripts: [{ name: `${providerConfigKey}-on-event`, fileBody: { js: 'js file', ts: 'ts file' }, event: 'post-connection-creation' }]
        });
        const deployBody = (body: Partial<PostDeploy['Body']>): PostDeploy['Body'] => ({
            debug: false,
            flowConfigs: [],
            nangoYamlBody: '',
            onEventScriptsByProvider: [],
            reconcile: true,
            deployMode: 'all',
            sdkVersion: '0.61.3-zero',
            ...body
        });
        const remoteState = async (env: DBEnvironment) => {
            const syncConfigs = await getSyncConfigsAsStandardConfig(env.id);
            const scripts = await onEventScriptService.getByEnvironmentId(env.id);
            return {
                syncs: (syncConfigs ?? []).flatMap((config) => config.syncs.map((sync) => `${config.providerConfigKey}:${sync.name}`)).sort(),
                onEvents: scripts.map((script) => `${script.providerConfigKey}:${script.name}`).sort()
            };
        };
        const seedDeployedScripts = async (providers = ['github', 'slack']) => {
            const seed = await seeders.seedAccountEnvAndUser();
            for (const provider of providers) {
                await seeders.createConfigSeed(seed.env, provider, provider);
            }
            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: seed.apiKey.secret,
                body: deployBody({
                    flowConfigs: providers.map((provider) => flow(provider, `${provider}-sync`)),
                    onEventScriptsByProvider: providers.map(onEvents)
                })
            });
            isSuccess(res.json);
            return seed;
        };

        it('should reject a scope that does not match the deploy mode', async () => {
            const seed = await seeders.seedAccountEnvAndUser();
            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: seed.apiKey.secret,
                body: deployBody({ deployMode: 'integration', reconciliationScope: { kind: 'environment' } })
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error).toMatchObject({
                code: 'invalid_body',
                errors: [{ message: 'A reconciliation scope of kind "environment" requires deployMode "all"', path: ['reconciliationScope'] }]
            });
        });

        it('should reject scripts outside of the integration scope', async () => {
            const seed = await seeders.seedAccountEnvAndUser();
            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: seed.apiKey.secret,
                body: deployBody({
                    deployMode: 'integration',
                    reconciliationScope: { kind: 'integration', integrationId: 'github' },
                    onEventScriptsByProvider: [onEvents('slack')]
                })
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error).toMatchObject({
                code: 'invalid_body',
                errors: [{ message: 'Scripts must match the integration reconciliation scope', path: ['reconciliationScope'] }]
            });
        });

        it('should deploy a package containing only on-event scripts', async () => {
            const seed = await seeders.seedAccountEnvAndUser();
            await seeders.createConfigSeed(seed.env, 'github', 'github');

            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: seed.apiKey.secret,
                body: deployBody({ reconciliationScope: { kind: 'environment' }, onEventScriptsByProvider: [onEvents('github')] })
            });

            isSuccess(res.json);
            const scripts = await onEventScriptService.getByEnvironmentId(seed.env.id);
            expect(scripts.map((script) => `${script.providerConfigKey}:${script.name}`)).toStrictEqual(['github:github-on-event']);
        });

        it('should deploy scripts for two integrations', async () => {
            const { env } = await seedDeployedScripts();

            expect(await remoteState(env)).toStrictEqual({
                syncs: ['github:github-sync', 'slack:slack-sync'],
                onEvents: ['github:github-on-event', 'slack:slack-on-event']
            });
        });

        it.each([
            { label: 'function scope', options: { reconciliationScope: { kind: 'function', integrationId: 'github', name: 'github-sync' } } },
            { label: 'legacy deployMode', options: { deployMode: 'single' } },
            { label: 'legacy singleDeployMode', options: { singleDeployMode: true } }
        ] as const)('should preview and deploy one script with $label without removing other scripts or on-event hooks', async ({ options }) => {
            const { env, apiKey } = await seedDeployedScripts();
            const {
                deployMode: _deployMode,
                nangoYamlBody: _nangoYamlBody,
                ...body
            } = deployBody({
                flowConfigs: [flow('github', 'github-sync')]
            });
            const before = await remoteState(env);
            const confirmation = await api.fetch('/sync/deploy/confirmation', {
                method: 'POST',
                token: apiKey.secret,
                body: { ...body, ...options, reconcile: false }
            });

            isSuccess(confirmation.json);
            expect(confirmation.json.deletedSyncs).toEqual([]);
            expect(confirmation.json.deletedActions).toEqual([]);
            expect(confirmation.json.deletedOnEventScripts).toEqual([]);

            const result = await api.fetch(endpoint, {
                method: 'POST',
                token: apiKey.secret,
                body: { ...body, ...options, nangoYamlBody: '' }
            });

            isSuccess(result.json);
            expect(await remoteState(env)).toEqual(before);
            expect(result.json).toMatchObject([{ name: 'github-sync', providerConfigKey: 'github' }]);
        });

        it('should keep the on-event scripts of other integrations on an integration deploy', async () => {
            const { env, apiKey } = await seedDeployedScripts();
            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: apiKey.secret,
                body: deployBody({ deployMode: 'integration', flowConfigs: [flow('github', 'github-sync')], onEventScriptsByProvider: [onEvents('github')] })
            });

            isSuccess(res.json);
            expect(await remoteState(env)).toStrictEqual({
                syncs: ['github:github-sync', 'slack:slack-sync'],
                onEvents: ['github:github-on-event', 'slack:slack-on-event']
            });
        });

        it('should not remove anything on an empty deploy without a scope', async () => {
            const { env, apiKey } = await seedDeployedScripts();
            const res = await api.fetch(endpoint, { method: 'POST', token: apiKey.secret, body: deployBody({}) });

            isSuccess(res.json);
            expect(await remoteState(env)).toStrictEqual({
                syncs: ['github:github-sync', 'slack:slack-sync'],
                onEvents: ['github:github-on-event', 'slack:slack-on-event']
            });
        });

        it('should preview and remove every script of an integration on an empty integration deploy', async () => {
            const { env, apiKey } = await seedDeployedScripts();
            const body = deployBody({ deployMode: 'integration', reconciliationScope: { kind: 'integration', integrationId: 'slack' } });
            const { nangoYamlBody: _nangoYamlBody, ...confirmationBody } = body;
            const confirmation = await api.fetch('/sync/deploy/confirmation', {
                method: 'POST',
                token: apiKey.secret,
                body: { ...confirmationBody, reconcile: false }
            });

            isSuccess(confirmation.json);
            expect(confirmation.json.deletedSyncs).toMatchObject([{ name: 'slack-sync', providerConfigKey: 'slack' }]);
            expect(confirmation.json.deletedOnEventScripts).toStrictEqual([
                { name: 'slack-on-event', providerConfigKey: 'slack', event: 'post-connection-creation' }
            ]);

            const res = await api.fetch(endpoint, { method: 'POST', token: apiKey.secret, body });

            isSuccess(res.json);
            expect(await remoteState(env)).toStrictEqual({ syncs: ['github:github-sync'], onEvents: ['github:github-on-event'] });
        });

        it('should preview and remove every script of the environment on an empty environment deploy', async () => {
            const { env, apiKey } = await seedDeployedScripts();
            const body = deployBody({ reconciliationScope: { kind: 'environment' } });
            const { nangoYamlBody: _nangoYamlBody, ...confirmationBody } = body;
            const confirmation = await api.fetch('/sync/deploy/confirmation', {
                method: 'POST',
                token: apiKey.secret,
                body: { ...confirmationBody, reconcile: false }
            });

            isSuccess(confirmation.json);
            expect(confirmation.json.deletedSyncs.map(({ providerConfigKey, name }) => `${providerConfigKey}:${name}`).sort()).toStrictEqual([
                'github:github-sync',
                'slack:slack-sync'
            ]);
            expect(confirmation.json.deletedOnEventScripts.map(({ providerConfigKey, name }) => `${providerConfigKey}:${name}`).sort()).toStrictEqual([
                'github:github-on-event',
                'slack:slack-on-event'
            ]);

            const res = await api.fetch(endpoint, { method: 'POST', token: apiKey.secret, body });

            isSuccess(res.json);
            expect(await remoteState(env)).toStrictEqual({ syncs: [], onEvents: [] });
        });
    });

    describe('models_json_schema handling', () => {
        it('should use per-flow models_json_schema directly', async () => {
            const { env, apiKey } = await seeders.seedAccountEnvAndUser();
            await seeders.createConfigSeed(env, 'unauthenticated', 'unauthenticated');

            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: apiKey.secret,
                body: {
                    debug: false,
                    flowConfigs: [
                        {
                            syncName: 'test',
                            fileBody: { js: 'js file', ts: 'ts file' },
                            providerConfigKey: 'unauthenticated',
                            endpoints: [{ method: 'GET', path: '/path' }],
                            runs: 'every day',
                            type: 'sync',
                            attributes: {},
                            auto_start: false,
                            metadata: { description: 'a' },
                            sync_type: 'full',
                            track_deletes: false,
                            input: 'Input',
                            models: ['Output'],
                            models_json_schema: {
                                definitions: {
                                    Input: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'], additionalProperties: false },
                                    Output: {
                                        type: 'object',
                                        properties: { ref: { $ref: '#/definitions/Ref' } },
                                        required: ['ref'],
                                        additionalProperties: false
                                    },
                                    Ref: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false }
                                }
                            }
                        }
                    ],
                    nangoYamlBody: '',
                    onEventScriptsByProvider: [],
                    reconcile: false,
                    deployMode: 'all',
                    sdkVersion: '0.61.3-yaml'
                }
            });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);

            const syncConfigs = await getSyncConfigsAsStandardConfig(env.id);
            expect(syncConfigs).toHaveLength(1);
            expect(syncConfigs?.[0]?.syncs[0]?.json_schema).toStrictEqual({
                definitions: {
                    Input: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'], additionalProperties: false },
                    Output: { type: 'object', properties: { ref: { $ref: '#/definitions/Ref' } }, required: ['ref'], additionalProperties: false },
                    Ref: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false }
                }
            });
        });

        it('should filter top-level jsonSchema to only the models used by a flow (legacy format)', async () => {
            const { env, apiKey } = await seeders.seedAccountEnvAndUser();
            await seeders.createConfigSeed(env, 'unauthenticated', 'unauthenticated');

            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: apiKey.secret,
                body: {
                    debug: false,
                    jsonSchema: {
                        $comment: '',
                        $schema: 'http://json-schema.org/draft-07/schema#',
                        definitions: {
                            Input: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'], additionalProperties: false },
                            Output: {
                                type: 'object',
                                properties: { ref: { $ref: '#/definitions/Ref' } },
                                required: ['ref'],
                                additionalProperties: false
                            },
                            Ref: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
                            // This model is in the aggregated schema but not used by the flow — it should be filtered out
                            Unrelated: { type: 'object', properties: { name: { type: 'string' } }, additionalProperties: false }
                        }
                    },
                    flowConfigs: [
                        {
                            syncName: 'test',
                            fileBody: { js: 'js file', ts: 'ts file' },
                            providerConfigKey: 'unauthenticated',
                            endpoints: [{ method: 'GET', path: '/path' }],
                            runs: 'every day',
                            type: 'sync',
                            attributes: {},
                            auto_start: false,
                            metadata: { description: 'a' },
                            sync_type: 'full',
                            track_deletes: false,
                            input: 'Input',
                            models: ['Output']
                        }
                    ],
                    nangoYamlBody: '',
                    onEventScriptsByProvider: [],
                    reconcile: false,
                    deployMode: 'all',
                    sdkVersion: '0.61.3-yaml'
                }
            });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);

            const syncConfigs = await getSyncConfigsAsStandardConfig(env.id);
            expect(syncConfigs).toHaveLength(1);
            expect(syncConfigs?.[0]?.syncs[0]?.json_schema).toStrictEqual({
                definitions: {
                    Input: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'], additionalProperties: false },
                    Output: { type: 'object', properties: { ref: { $ref: '#/definitions/Ref' } }, required: ['ref'], additionalProperties: false },
                    Ref: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false }
                    // Unrelated is absent
                }
            });
        });
    });

    describe('trial start on failed deploy', () => {
        it('does not start the trial when the deploy fails', async () => {
            const { env, apiKey, plan } = await seeders.seedAccountEnvAndUser({ plan: { trial_end_at: null, auto_idle: true } });
            expect(plan.trial_end_at).toBeNull();

            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: apiKey.secret,
                body: {
                    debug: false,
                    flowConfigs: [
                        {
                            syncName: 'test',
                            fileBody: { js: 'js file', ts: 'ts file' },
                            providerConfigKey: 'does-not-exist',
                            endpoints: [{ method: 'GET', path: '/path' }],
                            runs: 'every day',
                            type: 'sync',
                            attributes: {},
                            auto_start: false,
                            metadata: { description: 'a' },
                            sync_type: 'full',
                            track_deletes: false,
                            input: 'Input',
                            models: ['Output']
                        }
                    ],
                    nangoYamlBody: '',
                    onEventScriptsByProvider: [],
                    reconcile: false,
                    deployMode: 'all',
                    sdkVersion: '0.61.3-yaml'
                }
            });

            isError(res.json);
            expect(res.res.status).not.toBe(200);

            const updatedPlan = (await getPlan(db.knex, { accountId: env.account_id })).unwrap();
            expect(updatedPlan.trial_end_at).toBeNull();
        });
    });
});
