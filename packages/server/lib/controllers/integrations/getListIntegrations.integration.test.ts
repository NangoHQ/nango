import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import { getConnectSessionToken, isSuccess, runServer, shouldBeProtected } from '../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/integrations';

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

    it('should be accessible with private key', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, { method: 'GET', token: env.secret_key });
        isSuccess(res.json);
        expect(res.res.status).toBe(200);
    });

    it('should be accessible with connect session token', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const token = await getConnectSessionToken(api, env);
        const res = await api.fetch(endpoint, { method: 'GET', token });
        isSuccess(res.json);
        expect(res.res.status).toBe(200);
    });

    it('should enforce no query params', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

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
        const { env } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, { method: 'GET', token: env.secret_key });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: []
        });
    });

    it('should list one', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(endpoint, { method: 'GET', token: env.secret_key });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: [
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
        const { env } = await seeders.seedAccountEnvAndUser();
        const { env: env2 } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env2, 'github', 'github');

        const res = await api.fetch(endpoint, { method: 'GET', token: env.secret_key });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: []
        });
    });
});
