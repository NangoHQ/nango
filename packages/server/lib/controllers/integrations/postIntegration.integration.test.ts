import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/integrations';
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

    it('should validate the body', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            // @ts-expect-error on purpose
            body: { provider: 'invalid', unique_key: '1832_@$ùé&', display_name: false, credentials: { authType: 'INVALID' } }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                errors: [
                    { code: 'invalid_format', message: 'Invalid string: must match pattern /^[a-zA-Z0-9~:.@ _-]+$/', path: ['unique_key'] },
                    { code: 'invalid_type', message: 'Invalid input: expected string, received boolean', path: ['display_name'] },
                    { code: 'invalid_union', message: 'invalid credentials object', path: ['credentials', 'type'] }
                ]
            }
        });
    });

    it('should validate the provider', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            body: { provider: 'invalid', unique_key: 'foobar' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'invalid_body', errors: [{ code: 'invalid_string', message: 'Invalid provider', path: ['provider'] }] }
        });
    });

    it('should create an integration', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            body: { provider: 'algolia', unique_key: 'foobar' }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: {
                created_at: expect.toBeIsoDate(),
                display_name: 'Algolia',
                logo: 'http://localhost:3003/images/template-logos/algolia.svg',
                provider: 'algolia',
                unique_key: 'foobar',
                updated_at: expect.toBeIsoDate(),
                forward_webhooks: true
            }
        });
    });

    it('should add webhookSecret when creds.webhook_secret is present', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            body: {
                provider: 'github',
                unique_key: 'github',
                credentials: {
                    type: 'OAUTH2',
                    client_id: 'client-id',
                    client_secret: 'client-secret',
                    scopes: 'scope',
                    webhook_secret: 'new_secret'
                }
            }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: {
                created_at: expect.toBeIsoDate(),
                display_name: 'GitHub (User OAuth)',
                logo: 'http://localhost:3003/images/template-logos/github.svg',
                provider: 'github',
                unique_key: 'github',
                updated_at: expect.toBeIsoDate(),
                forward_webhooks: true
            }
        });

        const resGet = await api.fetch(getEndpoint, {
            method: 'GET',
            token: env.secret_key,
            params: { uniqueKey: 'github' },
            query: { include: ['credentials'] }
        });

        isSuccess(resGet.json);
        const credentials = resGet.json.data.credentials as { webhook_secret: string | null };
        expect(credentials.webhook_secret).toBe('new_secret');
    });

    it('should not add webhookSecret when creds.webhook_secret is not present', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            body: {
                provider: 'github',
                unique_key: 'github',
                credentials: {
                    type: 'OAUTH2',
                    client_id: 'client-id',
                    client_secret: 'client-secret',
                    scopes: 'scope'
                }
            }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: {
                created_at: expect.toBeIsoDate(),
                display_name: 'GitHub (User OAuth)',
                logo: 'http://localhost:3003/images/template-logos/github.svg',
                provider: 'github',
                unique_key: 'github',
                updated_at: expect.toBeIsoDate(),
                forward_webhooks: true
            }
        });

        const resGet = await api.fetch(getEndpoint, {
            method: 'GET',
            token: env.secret_key,
            params: { uniqueKey: 'github' },
            query: { include: ['credentials'] }
        });

        isSuccess(resGet.json);
        const credentials = resGet.json.data.credentials as { webhook_secret: string | null };
        expect(credentials.webhook_secret).toBeNull();
    });
});
