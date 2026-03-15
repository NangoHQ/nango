import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import { isSuccess, runServer, shouldBeProtected } from '../../../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/api/v1/integrations/:providerConfigKey';

describe(`GET ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'GET',
            query: { env: 'dev' },
            params: { providerConfigKey: 'github' }
        });

        shouldBeProtected(res);
    });

    it('should return integration details', async () => {
        const { env, secret } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(endpoint, {
            method: 'GET',
            query: { env: 'dev' },
            token: secret.secret,
            params: { providerConfigKey: 'github' }
        });

        isSuccess(res.json);
        expect(res.json.data.integration.unique_key).toBe('github');
        expect(res.json.data.meta.connectionsCount).toBe(0);
        expect(res.json.data.meta.webhookSecret).toBeNull();
    });

    it('should return stored webhookSecret', async () => {
        const { env, secret } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        // Set a webhookSecret via PATCH
        await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: 'dev' },
            token: secret.secret,
            params: { providerConfigKey: 'github' },
            body: { webhookSecret: 'my-webhook-secret' }
        });

        const res = await api.fetch(endpoint, {
            method: 'GET',
            query: { env: 'dev' },
            token: secret.secret,
            params: { providerConfigKey: 'github' }
        });

        isSuccess(res.json);
        expect(res.json.data.meta.webhookSecret).toBe('my-webhook-secret');
    });

    it('should return 404 for non-existent integration', async () => {
        const { secret } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, {
            method: 'GET',
            query: { env: 'dev' },
            token: secret.secret,
            params: { providerConfigKey: 'non-existent' }
        });

        expect(res.res.status).toBe(404);
    });
});
