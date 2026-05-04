import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { flowService, seeders } from '@nangohq/shared';

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
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(
            route,
            // @ts-expect-error missing query on purpose
            { method: 'GET', token: apiKey.secret, params: { providerConfigKey: 'test' } }
        );

        shouldRequireQueryEnv(res);
    });

    it('should get 404', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            params: { providerConfigKey: 'test' },
            token: apiKey.secret
        });

        isError(res.json);
        expect(res.res.status).toBe(404);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'not_found', message: 'Integration does not exist' }
        });
    });

    it('should get github templates', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            params: { providerConfigKey: 'github' },
            token: apiKey.secret
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        const scriptCreateOrUpdateFile = res.json.data.flows.find((value) => value.name === 'create-or-update-file');
        expect(scriptCreateOrUpdateFile).not.toBeUndefined();
        expect(scriptCreateOrUpdateFile).toMatchObject({
            description: expect.any(String),
            enabled: false,
            endpoints: [{ group: 'Repositories', method: 'POST', path: '/actions/create-or-update-file' }],
            input: 'ActionInput_github_createorupdatefile',
            source: 'catalog',
            json_schema: expect.any(Object),
            last_deployed: null,
            name: 'create-or-update-file',
            returns: ['ActionOutput_github_createorupdatefile'],
            runs: '',
            scopes: ['repo'],
            type: 'action',
            version: expect.any(String),
            webhookSubscriptions: []
        });
    });

    it('should create same template and deduplicate correctly', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const config = await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, provider: 'github' });

        await seeders.createSyncSeeds({
            connectionId: connection.id,
            environment_id: env.id,
            nango_config_id: config.id!,
            sync_name: 'create-or-update-file',
            type: 'action',
            models: [],
            endpoints: [{ group: 'Repositories', method: 'POST', path: '/actions/create-or-update-file' }]
        });

        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            params: { providerConfigKey: 'github' },
            token: apiKey.secret
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        const scriptCreateOrUpdateFile = res.json.data.flows.find((value) => value.name === 'create-or-update-file');
        expect(scriptCreateOrUpdateFile).not.toBeUndefined();
        expect(scriptCreateOrUpdateFile).toMatchObject({
            enabled: true,
            endpoints: [{ group: 'Repositories', method: 'POST', path: '/actions/create-or-update-file' }],
            source: 'repo',
            name: 'create-or-update-file',
            type: 'action'
        });

        // Should not duplicate template vs enabled
        expect(res.json.data.flows.filter((value) => value.name === 'create-or-update-file')).toHaveLength(1);

        // Should not dedup the sync with the same endpoint path
        const scriptListFile = res.json.data.flows.find((value) => value.name === 'list-files');
        expect(scriptListFile).not.toBeUndefined();
    });

    it('should keep renamed templates visible when an older sync with the same model name exists', async () => {
        const getAllAvailableFlowsAsStandardConfigSpy = vi.spyOn(flowService, 'getAllAvailableFlowsAsStandardConfig').mockReturnValue([
            {
                providerConfigKey: 'hubspot',
                actions: [],
                syncs: [
                    seeders.getTestStdSyncConfig({
                        name: 'sync-users',
                        type: 'sync',
                        returns: ['User'],
                        description: 'Sync provisioned users',
                        auto_start: true,
                        sync_type: 'full',
                        version: '1.0.0',
                        enabled: false,
                        endpoints: [{ group: 'Users', method: 'GET', path: '/syncs/sync-users' }],
                        runs: 'every hour'
                    })
                ],
                ['on-events']: []
            }
        ]);

        try {
            const { env, apiKey } = await seeders.seedAccountEnvAndUser();
            const config = await seeders.createConfigSeed(env, 'hubspot', 'hubspot');
            const connection = await seeders.createConnectionSeed({ env, provider: 'hubspot' });

            await seeders.createSyncSeeds({
                connectionId: connection.id,
                environment_id: env.id,
                nango_config_id: config.id!,
                sync_name: 'users',
                type: 'sync',
                models: ['User'],
                endpoints: [{ group: 'Users', method: 'GET', path: '/users' }]
            });

            const res = await api.fetch(route, {
                method: 'GET',
                query: { env: 'dev' },
                params: { providerConfigKey: 'hubspot' },
                token: apiKey.secret
            });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);

            const oldFlow = res.json.data.flows.find((value) => value.name === 'users');
            const newTemplate = res.json.data.flows.find((value) => value.name === 'sync-users');

            expect(oldFlow).toMatchObject({
                name: 'users',
                returns: ['User'],
                type: 'sync'
            });
            expect(newTemplate).not.toBeUndefined();
            expect(newTemplate).toMatchObject({
                enabled: false,
                name: 'sync-users',
                returns: ['User'],
                type: 'sync'
            });
        } finally {
            getAllAvailableFlowsAsStandardConfigSpy.mockRestore();
        }
    });
});
