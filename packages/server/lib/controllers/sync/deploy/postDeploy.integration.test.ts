import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { envs } from '@nangohq/logs';
import { getSyncConfigsAsStandardConfig, seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../../utils/tests.js';

import type { DBCustomerKey, DBEnvironment } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/sync/deploy';

describe(`POST ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
        envs.NANGO_LOGS_ENABLED = false;
    });
    afterAll(() => {
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
});
