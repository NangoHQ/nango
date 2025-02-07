import { seeders } from '@nangohq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isSuccess, runServer, shouldBeProtected } from '../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/config';

describe(`GET ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, { method: 'GET' });

        shouldBeProtected(res);
    });

    it('should enforce no query params', async () => {
        const env = await seeders.createEnvironmentSeed();

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: env.secret_key,
            // @ts-expect-error on purpose
            query: { foo: 'bar' }
        });

        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_query_params',
                errors: [{ code: 'unrecognized_keys', message: "Unrecognized key(s) in object: 'foo'", path: [] }]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should list empty', async () => {
        const env = await seeders.createEnvironmentSeed();

        const res = await api.fetch(endpoint, { method: 'GET', token: env.secret_key });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual<typeof res.json>({
            configs: []
        });
    });

    it('should list one', async () => {
        const env = await seeders.createEnvironmentSeed();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(endpoint, { method: 'GET', token: env.secret_key });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual<typeof res.json>({
            configs: [
                {
                    provider: 'github',
                    unique_key: 'github',
                    display_name: 'GitHub (User OAuth)',
                    logo: 'http://localhost:3003/images/template-logos/github.svg',
                    created_at: expect.toBeIsoDate(),
                    updated_at: expect.toBeIsoDate()
                }
            ]
        });
    });

    it('should not list other env', async () => {
        const env = await seeders.createEnvironmentSeed();
        const env2 = await seeders.createEnvironmentSeed();
        await seeders.createConfigSeed(env2, 'github', 'github');

        const res = await api.fetch(endpoint, { method: 'GET', token: env.secret_key });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual<typeof res.json>({
            configs: []
        });
    });
});
