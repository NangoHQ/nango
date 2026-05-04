import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { envs } from '@nangohq/logs';
import { getSyncConfigsAsStandardConfig, seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/sync/deploy/internal';

describe(`POST ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
        envs.NANGO_LOGS_ENABLED = false;
    });
    afterAll(() => {
        api.server.close();
    });
    afterEach(() => {
        delete process.env['NANGO_SHARED_DEV_ACCOUNT_UUID'];
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { customEnvironment: 'dev' },
            // @ts-expect-error don't care
            body: {}
        });

        shouldBeProtected(res);
    });

    it('should be forbidden for non-internal accounts', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();

        // NANGO_SHARED_DEV_ACCOUNT_UUID is not set, so no account matches
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            query: { customEnvironment: 'dev' },
            body: {
                debug: false,
                flowConfigs: [],
                nangoYamlBody: '',
                reconcile: false,
                deployMode: 'all'
            }
        });

        isError(res.json);
        expect(res.res.status).toBe(403);
        expect(res.json).toStrictEqual({ error: { code: 'forbidden', message: 'This endpoint is only available for Nango internal use' } });
    });

    describe('models_json_schema handling', () => {
        it('should use per-flow models_json_schema directly', async () => {
            const { account, env, apiKey } = await seeders.seedAccountEnvAndUser();
            await seeders.createConfigSeed(env, 'unauthenticated', 'unauthenticated');
            process.env['NANGO_SHARED_DEV_ACCOUNT_UUID'] = account.uuid;

            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: apiKey.secret,
                query: { customEnvironment: 'dev' },
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
            const { account, env, apiKey } = await seeders.seedAccountEnvAndUser();
            await seeders.createConfigSeed(env, 'unauthenticated', 'unauthenticated');
            process.env['NANGO_SHARED_DEV_ACCOUNT_UUID'] = account.uuid;

            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: apiKey.secret,
                query: { customEnvironment: 'dev' },
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
