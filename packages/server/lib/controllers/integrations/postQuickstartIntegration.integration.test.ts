import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/integrations/quickstart';
const getEndpoint = '/integrations/:uniqueKey';

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
            // @ts-expect-error on purpose
            body: { provider: 'github' }
        });

        shouldBeProtected(res);
    });

    it('should reject credentials in the body', async () => {
        const { secret } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: secret.secret,
            body: {
                provider: 'github',
                unique_key: 'github-quickstart',
                credentials: {
                    type: 'OAUTH2',
                    client_id: 'client-id',
                    client_secret: 'client-secret'
                }
            } as any
        });

        isError(res.json);
        expect(res.json.error.code).toBe('invalid_body');
    });

    it('should validate the provider', async () => {
        const { secret } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: secret.secret,
            body: { provider: 'invalid', unique_key: 'foobar' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'invalid_body', errors: [{ code: 'invalid_string', message: 'Invalid provider', path: ['provider'] }] }
        });
    });

    it('should reject providers that do not require a developer app', async () => {
        const { secret } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: secret.secret,
            body: { provider: 'algolia', unique_key: 'algolia-quickstart' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'invalid_body', message: 'Quickstart is only available for providers that require a developer app' }
        });
    });

    it('should reject providers without a Nango-provided developer app', async () => {
        const { secret } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: secret.secret,
            body: { provider: 'docusign-sandbox', unique_key: 'docusign-quickstart' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'invalid_body', message: 'No Nango-provided developer app is configured for this provider' }
        });
    });

    it('should reject duplicate unique keys', async () => {
        const { env, secret } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github-quickstart', 'github');
        await seeders.createSharedCredentialsSeed('github');

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: secret.secret,
            body: { provider: 'github', unique_key: 'github-quickstart' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'invalid_body', errors: [{ code: 'invalid_string', message: 'Unique key already exists', path: ['uniqueKey'] }] }
        });
    });

    it('should create an integration with a Nango-provided developer app', async () => {
        const { secret } = await seeders.seedAccountEnvAndUser();
        await seeders.createSharedCredentialsSeed('github');

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: secret.secret,
            body: {
                provider: 'github',
                unique_key: 'github-quickstart',
                display_name: 'GitHub Quickstart',
                forward_webhooks: false
            }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: {
                created_at: expect.toBeIsoDate(),
                display_name: 'GitHub Quickstart',
                logo: 'http://localhost:3003/images/template-logos/github.svg',
                provider: 'github',
                unique_key: 'github-quickstart',
                updated_at: expect.toBeIsoDate(),
                forward_webhooks: false
            }
        });

        const resGet = await api.fetch(getEndpoint, {
            method: 'GET',
            token: secret.secret,
            params: { uniqueKey: 'github-quickstart' },
            query: { include: ['credentials'] }
        });

        isSuccess(resGet.json);
        expect(resGet.json.data.credentials).toStrictEqual({
            type: 'OAUTH2',
            client_id: '',
            client_secret: '',
            scopes: 'test',
            webhook_secret: null
        });
    });
});
