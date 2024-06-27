import { multipleMigrations } from '@nangohq/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isError, isSuccess, runServer, shouldBeProtected } from '../../../utils/tests.js';
import { getSyncConfigsAsStandardConfig, seeders } from '@nangohq/shared';
import { envs } from '@nangohq/logs';
import type { Environment } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/sync/deploy';

describe(`POST ${endpoint}`, () => {
    beforeAll(async () => {
        await multipleMigrations();
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
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
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
                    { code: 'invalid_type', message: 'Required', path: ['flowConfigs'] },
                    { code: 'invalid_type', message: 'Required', path: ['postConnectionScriptsByProvider'] },
                    { code: 'invalid_type', message: 'Required', path: ['nangoYamlBody'] },
                    { code: 'invalid_type', message: 'Required', path: ['reconcile'] },
                    { code: 'invalid_type', message: 'Expected boolean, received string', path: ['debug'] }
                ]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should accept empty body', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            body: {
                debug: false,
                flowConfigs: [],
                nangoYamlBody: '',
                postConnectionScriptsByProvider: [],
                reconcile: false,
                singleDeployMode: false,
                jsonSchema: { $comment: '', $schema: 'http://json-schema.org/draft-07/schema#', definitions: {} }
            }
        });

        isSuccess(res.json);

        expect(res.json).toStrictEqual<typeof res.json>([]);
        expect(res.res.status).toBe(200);
    });

    describe('deploy', () => {
        let env: Environment;
        // This describe must be executed in order

        it('should deploy', async () => {
            const seed = await seeders.seedAccountEnvAndUser();
            env = seed.env;
            await seeders.createConfigSeed(env, 'unauthenticated', 'unauthenticated');
            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: env.secret_key,
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
                            endpoints: [{ GET: '/path' }],
                            runs: 'every day',
                            type: 'sync',
                            attributes: {},
                            auto_start: false,
                            metadata: { description: 'a' },
                            sync_type: 'full',
                            track_deletes: false,
                            input: 'Input',
                            models: ['Output'],
                            model_schema: [
                                { name: 'Input', fields: [{ name: 'id', value: 'number', tsType: true, array: false, optional: false }] },
                                { name: 'Output', fields: [{ name: 'ref', value: 'Ref', model: true, array: false, optional: false }] },
                                { name: 'Ref', fields: [{ name: 'id', value: 'string', tsType: true, array: false, optional: false }] }
                            ]
                        }
                    ],
                    nangoYamlBody: ``,
                    postConnectionScriptsByProvider: [],
                    reconcile: false,
                    singleDeployMode: false
                }
            });

            isSuccess(res.json);

            expect(res.json).toStrictEqual<typeof res.json>([{ models: ['Output'], name: 'test', providerConfigKey: 'unauthenticated', type: 'sync' }]);
            expect(res.res.status).toBe(200);

            // Check that everything was inserted in DB
            const syncConfigs = await getSyncConfigsAsStandardConfig(env!.id);
            expect(syncConfigs).toHaveLength(1);
            expect(syncConfigs).toStrictEqual([
                {
                    actions: [],
                    postConnectionScripts: [],
                    provider: 'unauthenticated',
                    providerConfigKey: 'unauthenticated',
                    syncs: [
                        {
                            id: expect.any(Number),
                            attributes: {},
                            auto_start: false,
                            description: 'a',
                            enabled: true,
                            endpoints: [{ GET: '/path' }],
                            input: {
                                fields: [{ array: false, name: 'id', optional: false, tsType: true, value: 'number' }],
                                name: 'Input'
                            },
                            is_public: false,
                            last_deployed: expect.toBeIsoDate(),
                            layout_mode: 'nested',
                            models: [
                                { name: 'Input', fields: [{ array: false, name: 'id', optional: false, tsType: true, value: 'number' }] },
                                { name: 'Output', fields: [{ array: false, name: 'ref', optional: false, model: true, value: 'Ref' }] },
                                { name: 'Ref', fields: [{ name: 'id', value: 'string', tsType: true, array: false, optional: false }] }
                            ],
                            returns: ['Output'],
                            nango_yaml_version: 'v2',
                            scopes: [],
                            pre_built: false,
                            runs: 'every day',
                            name: 'test',
                            sync_type: 'full',
                            track_deletes: false,
                            type: 'sync',
                            version: '1',
                            webhookSubscriptions: [],
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
                            }
                        }
                    ]
                }
            ]);
        });

        it('should have removed syncs from DB', async () => {
            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: env.secret_key,
                body: {
                    debug: false,
                    jsonSchema: {
                        $comment: '',
                        $schema: 'http://json-schema.org/draft-07/schema#',
                        definitions: {}
                    },
                    flowConfigs: [],
                    nangoYamlBody: ``,
                    postConnectionScriptsByProvider: [],
                    reconcile: true,
                    singleDeployMode: false
                }
            });
            isSuccess(res.json);

            expect(res.json).toStrictEqual<typeof res.json>([]);
            expect(res.res.status).toBe(200);

            // Check that everything was inserted in DB
            const syncConfigs = await getSyncConfigsAsStandardConfig(env!.id);
            expect(syncConfigs).toBeNull();
        });
    });
});
