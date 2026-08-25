import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getGlobalWebhookReceiveUrl, seeders } from '@nangohq/shared';

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
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const token = await getConnectSessionToken(api, apiKey.secret);
        const res = await api.fetch(endpoint, { method: 'GET', token, params: { uniqueKey: 'github' }, query: {} });
        isError(res.json);
        expect(res.res.status).toBe(401);
    });

    it('should enforce no query params', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            // @ts-expect-error on purpose
            query: { foo: 'bar' }
        });

        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_query_params',
                errors: [{ code: 'unrecognized_keys', message: 'Unrecognized key: "foo"', path: [] }]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should list empty', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, { method: 'GET', token: apiKey.secret, params: { uniqueKey: 'github' }, query: {} });

        isError(res.json);
        expect(res.res.status).toBe(404);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'not_found', message: 'Integration "github" does not exist' }
        });
    });

    it('should list one', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(endpoint, { method: 'GET', token: apiKey.secret, params: { uniqueKey: 'github' }, query: {} });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: {
                provider: 'github',
                unique_key: 'github',
                display_name: 'GitHub (User OAuth)',
                logo: 'http://localhost:3003/images/template-logos/github.svg',
                created_at: expect.toBeIsoDate(),
                updated_at: expect.toBeIsoDate(),
                forward_webhooks: true
            }
        });
    });

    it('should get webhook', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(endpoint, { method: 'GET', token: apiKey.secret, params: { uniqueKey: 'github' }, query: { include: ['webhook'] } });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json.data.webhook_url).toStrictEqual(null);
    });

    it('should put integration unique_key in webhook_url when it differs from provider template', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'platform-google', 'google');

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            params: { uniqueKey: 'platform-google' },
            query: { include: ['webhook'] }
        });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json.data.unique_key).toBe('platform-google');
        expect(res.json.data.provider).toBe('google');
        expect(res.json.data.webhook_url).toStrictEqual(`${getGlobalWebhookReceiveUrl()}/${env.uuid}/platform-google`);
    });

    it('should URI-encode integration unique_key in webhook_url path segment', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const uniqueKey = 'acme:corp';
        await seeders.createConfigSeed(env, uniqueKey, 'google');

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            params: { uniqueKey },
            query: { include: ['webhook'] }
        });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json.data.unique_key).toBe(uniqueKey);
        expect(res.json.data.webhook_url).toStrictEqual(`${getGlobalWebhookReceiveUrl()}/${env.uuid}/${encodeURIComponent(uniqueKey)}`);
    });

    it('should not list other env', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const { env: env2 } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env2, 'github', 'github');

        const res = await api.fetch(endpoint, { method: 'GET', token: apiKey.secret, params: { uniqueKey: 'github' }, query: {} });

        isError(res.json);
        expect(res.res.status).toBe(404);
    });

    it('should get credentials', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github', { oauth_client_id: 'foo', oauth_client_secret: 'bar', oauth_scopes: 'hello, world' });

        const res = await api.fetch(endpoint, { method: 'GET', token: apiKey.secret, params: { uniqueKey: 'github' }, query: { include: ['credentials'] } });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json.data.credentials).toStrictEqual({
            client_id: 'foo',
            client_secret: 'bar',
            scopes: 'hello, world',
            type: 'OAUTH2',
            webhook_secret: null
        });
    });
});
