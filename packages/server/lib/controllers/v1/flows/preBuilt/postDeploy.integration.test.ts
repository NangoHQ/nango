import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { getSyncConfigRaw, remoteFileService, seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/api/v1/flows/pre-built/deploy';

describe(`POST ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'dev' },
            body: { provider: 'github', providerConfigKey: 'github', scriptName: 'test', type: 'sync' }
        });

        shouldBeProtected(res);
    });

    it('should fail if no template exists for this provider and script name', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'dev' },
            token: env.secret_key,
            body: { provider: 'github', providerConfigKey: 'github', scriptName: 'test', type: 'sync' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'invalid_body', message: 'No template exists for this provider and script name' }
        });
    });

    it('should deploy a template', async () => {
        vi.spyOn(remoteFileService, 'copy').mockResolvedValue('_LOCAL_FILE_');
        const { env } = await seeders.seedAccountEnvAndUser();
        const integration = await seeders.createConfigSeed(env, 'airtable', 'airtable');
        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'dev' },
            token: env.secret_key,
            body: { provider: 'airtable', providerConfigKey: 'airtable', scriptName: 'tables', type: 'sync' }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({ data: { id: expect.any(Number) } });

        const sync = await getSyncConfigRaw({ environmentId: env.id, config_id: integration.id!, name: 'tables', isAction: false });
        expect(sync).toStrictEqual<typeof sync>({
            sync_name: 'tables',
            type: 'sync',
            models: ['Table'],
            active: true,
            attributes: {},
            auto_start: true,
            created_at: expect.any(Date),
            deleted: false,
            deleted_at: null,
            enabled: true,
            environment_id: env.id,
            file_location: '_LOCAL_FILE_',
            id: expect.any(Number),
            input: 'SyncMetadata_airtable_tables',
            is_public: true,
            metadata: {
                description: expect.any(String),
                scopes: ['schema.bases:read']
            },
            model_schema: null,
            models_json_schema: {
                definitions: {
                    SyncMetadata_airtable_tables: {
                        additionalProperties: false,
                        type: 'object'
                    },
                    Table: {
                        additionalProperties: false,
                        properties: {
                            baseId: {
                                type: 'string'
                            },
                            baseName: {
                                type: 'string'
                            },
                            fields: {
                                items: {
                                    anyOf: [
                                        {
                                            type: 'string'
                                        },
                                        {
                                            additionalProperties: false,
                                            type: 'object'
                                        }
                                    ]
                                },
                                type: 'array'
                            },
                            id: {
                                type: 'string'
                            },
                            name: {
                                type: 'string'
                            },
                            primaryFieldId: {
                                type: 'string'
                            },
                            views: {
                                items: {
                                    type: ['string']
                                },
                                type: 'array'
                            }
                        },
                        required: ['baseId', 'baseName', 'id', 'name', 'views', 'fields', 'primaryFieldId'],
                        type: 'object'
                    }
                }
            },
            nango_config_id: integration.id!,
            pre_built: true,
            runs: 'every day',
            sdk_version: expect.any(String),
            sync_type: 'full',
            track_deletes: true,
            updated_at: expect.any(Date),
            version: '1.0.0',
            webhook_subscriptions: null
        });
    });
});
