import { seeders } from '@nangohq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getConnectSessionToken, isError, isSuccess, runServer, shouldBeProtected } from '../../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/integrations/:uniqueKey';

describe(`GET ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, { method: 'GET', params: { uniqueKey: 'github' }, query: {} });

        shouldBeProtected(res);
    });

    it('should not be accessible with connect session token', async () => {
        const env = await seeders.createEnvironmentSeed();
        const token = await getConnectSessionToken(api, env);
        const res = await api.fetch(endpoint, { method: 'GET', token, params: { uniqueKey: 'github' }, query: {} });
        isError(res.json);
        expect(res.res.status).toBe(401);
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

        const res = await api.fetch(endpoint, { method: 'GET', token: env.secret_key, params: { uniqueKey: 'github' }, query: {} });

        isError(res.json);
        expect(res.res.status).toBe(404);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'not_found', message: 'Integration "github" does not exist' }
        });
    });

    it('should list one', async () => {
        const env = await seeders.createEnvironmentSeed();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(endpoint, { method: 'GET', token: env.secret_key, params: { uniqueKey: 'github' }, query: {} });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: {
                provider: 'github',
                unique_key: 'github',
                display_name: 'GitHub',
                logo: 'http://localhost:3003/images/template-logos/github.svg',
                created_at: expect.toBeIsoDate(),
                updated_at: expect.toBeIsoDate()
            }
        });
    });

    it('should get webhook', async () => {
        const env = await seeders.createEnvironmentSeed();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(endpoint, { method: 'GET', token: env.secret_key, params: { uniqueKey: 'github' }, query: { include: ['webhook'] } });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json.data.webhook_url).toStrictEqual(null);
    });

    it('should not list other env', async () => {
        const env = await seeders.createEnvironmentSeed();
        const env2 = await seeders.createEnvironmentSeed();
        await seeders.createConfigSeed(env2, 'github', 'github');

        const res = await api.fetch(endpoint, { method: 'GET', token: env.secret_key, params: { uniqueKey: 'github' }, query: {} });

        isError(res.json);
        expect(res.res.status).toBe(404);
    });

    it('should get credentials', async () => {
        const env = await seeders.createEnvironmentSeed();
        await seeders.createConfigSeed(env, 'github', 'github', { oauth_client_id: 'foo', oauth_client_secret: 'bar', oauth_scopes: 'hello, world' });

        const res = await api.fetch(endpoint, { method: 'GET', token: env.secret_key, params: { uniqueKey: 'github' }, query: { include: ['credentials'] } });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json.data.credentials).toStrictEqual({ client_id: 'foo', client_secret: 'bar', scopes: 'hello, world', type: 'OAUTH2' });
    });
});
