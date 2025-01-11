import { seeders } from '@nangohq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isError, isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../../../utils/tests.js';

const route = '/api/v1/integrations/:providerConfigKey/flows';
let api: Awaited<ReturnType<typeof runServer>>;
describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, { method: 'GET', query: { env: 'dev' }, params: { providerConfigKey: 'test' } });

        shouldBeProtected(res);
    });

    it('should enforce env query params', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(
            route,
            // @ts-expect-error missing query on purpose
            { method: 'GET', token: env.secret_key, params: { providerConfigKey: 'test' } }
        );

        shouldRequireQueryEnv(res);
    });

    it('should get 404', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            params: { providerConfigKey: 'test' },
            token: env.secret_key
        });

        isError(res.json);
        expect(res.res.status).toBe(404);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'not_found', message: 'Integration does not exist' }
        });
    });

    it('should get github templates', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            params: { providerConfigKey: 'github' },
            token: env.secret_key
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        const scriptWriteFile = res.json.data.flows.find((value) => value.name === 'write-file');
        expect(scriptWriteFile).not.toBeUndefined();
        expect(scriptWriteFile).toMatchObject({
            description: expect.any(String),
            enabled: false,
            endpoints: [{ group: 'Files', method: 'PUT', path: '/files' }],
            input: { fields: expect.any(Array), name: 'GithubWriteFileInput' },
            is_public: true,
            json_schema: null,
            last_deployed: null,
            models: expect.any(Array),
            name: 'write-file',
            pre_built: true,
            returns: ['GithubWriteFileActionResult'],
            runs: '',
            scopes: ['repo'],
            type: 'action',
            version: expect.any(String),
            webhookSubscriptions: []
        });
    });

    it('should create same template and deduplicate correctly', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const config = await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, provider: 'github' });

        await seeders.createSyncSeeds({
            connectionId: connection.id!,
            environment_id: env.id,
            nango_config_id: config.id!,
            sync_name: 'write-file',
            type: 'action',
            models: [],
            endpoints: [{ group: 'Files', method: 'PUT', path: '/files' }]
        });

        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            params: { providerConfigKey: 'github' },
            token: env.secret_key
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        const scriptWriteFile = res.json.data.flows.find((value) => value.name === 'write-file');
        expect(scriptWriteFile).not.toBeUndefined();
        expect(scriptWriteFile).toMatchObject({
            enabled: true,
            endpoints: [{ group: 'Files', method: 'PUT', path: '/files' }],
            is_public: false,
            name: 'write-file',
            pre_built: false,
            type: 'action'
        });

        // Should not duplicate template vs enabled
        expect(res.json.data.flows.filter((value) => value.name === 'write-file')).toHaveLength(1);

        // Should not dedup the sync with the same endpoint path
        const scriptListFile = res.json.data.flows.find((value) => value.name === 'list-files');
        expect(scriptListFile).not.toBeUndefined();
    });
});
