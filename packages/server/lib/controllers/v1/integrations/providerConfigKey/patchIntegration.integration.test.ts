import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { isError, isSuccess, runServer, shouldBeProtected } from '../../../../utils/tests.js';
import { seeders } from '@nangohq/shared';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/api/v1/integrations/:providerConfigKey';

describe(`PATCH ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: 'dev' },
            params: { providerConfigKey: 'github' },
            body: { integrationId: 'test' }
        });

        shouldBeProtected(res);
    });

    it('should be able to rename integration', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: 'dev' },
            token: env.secret_key,
            params: { providerConfigKey: 'github' },
            body: { integrationId: 'renamed' }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: { success: true }
        });

        // Get renamed integration
        const resGet = await api.fetch(endpoint, {
            method: 'GET',
            query: { env: 'dev' },
            token: env.secret_key,
            params: { providerConfigKey: 'renamed' }
        });
        isSuccess(resGet.json);
        expect(resGet.json).toMatchObject({
            data: { integration: { unique_key: 'renamed' } }
        });

        // Old name should not exists
        const resOld = await api.fetch(endpoint, {
            method: 'GET',
            query: { env: 'dev' },
            token: env.secret_key,
            params: { providerConfigKey: 'github' }
        });

        isError(resOld.json);
        expect(resOld.json).toStrictEqual<typeof resOld.json>({
            error: { code: 'not_found', message: 'Integration "github" does not exist' }
        });
    });

    it('should not be able to rename integration with active connection', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        await seeders.createConnectionSeed({ env, provider: 'github' });
        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: 'dev' },
            token: env.secret_key,
            params: { providerConfigKey: 'github' },
            body: { integrationId: 'renamed' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'invalid_body', message: "Can't rename an integration with active connections" }
        });
    });
});
