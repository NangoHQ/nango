import { seeders } from '@nangohq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isSuccess, runServer } from '../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/auth/unauthenticated/:providerConfigKey';

describe(`GET ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should create one connection with connection_id', async () => {
        const env = await seeders.createEnvironmentSeed();
        const config = await seeders.createConfigSeed(env, 'unauthenticated', 'unauthenticated');

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            query: { connection_id: 'a', public_key: env.public_key },
            params: { providerConfigKey: config.unique_key }
        });

        isSuccess(res);
        expect(res.json).toStrictEqual<typeof res.json>({
            connectionId: 'a',
            providerConfigKey: 'unauthenticated'
        });
    });

    it('should create one connection without connection_id', async () => {
        const env = await seeders.createEnvironmentSeed();
        const config = await seeders.createConfigSeed(env, 'unauthenticated', 'unauthenticated');

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            query: { public_key: env.public_key },
            params: { providerConfigKey: config.unique_key }
        });

        isSuccess(res);
        expect(res.json).toStrictEqual<typeof res.json>({
            connectionId: expect.any(String),
            providerConfigKey: 'unauthenticated'
        });
    });
});
