import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configService, seeders } from '@nangohq/shared';

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
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
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
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: { provider: 'invalid', unique_key: 'foobar' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'invalid_body', errors: [{ code: 'invalid_string', message: 'Invalid provider', path: ['provider'] }] }
        });
    });

    it('should create an integration', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
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

    it('should create a generic API key integration with auth presentation config', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: {
                provider: 'generic-api-key',
                unique_key: 'my-api',
                display_name: 'My API',
                generic_api_key: {
                    base_url: 'https://api.example.com',
                    placement: 'header',
                    name: 'Authorization',
                    value_template: 'Bearer {apiKey}',
                    verification: {
                        method: 'GET',
                        endpoint: '/v1/me'
                    }
                }
            }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: {
                created_at: expect.toBeIsoDate(),
                display_name: 'My API',
                generic_api_key: {
                    base_url: 'https://api.example.com',
                    placement: 'header',
                    name: 'Authorization',
                    value_template: 'Bearer {apiKey}',
                    verification: {
                        method: 'GET',
                        endpoint: '/v1/me'
                    }
                },
                logo: 'http://localhost:3003/images/template-logos/generic-api-key.svg',
                provider: 'generic-api-key',
                unique_key: 'my-api',
                updated_at: expect.toBeIsoDate(),
                forward_webhooks: true
            }
        });

        const config = await configService.getProviderConfig('my-api', env.id);
        expect(config?.custom).toMatchObject({
            generic_api_key_base_url: 'https://api.example.com',
            generic_api_key_placement: 'header',
            generic_api_key_name: 'Authorization',
            generic_api_key_value_template: 'Bearer {apiKey}',
            generic_api_key_verification_method: 'GET',
            generic_api_key_verification_endpoint: '/v1/me'
        });
    });

    it('should require generic API key config for generic API key integrations', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: { provider: 'generic-api-key', unique_key: 'my-api' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'invalid_body', message: 'Missing generic_api_key configuration' }
        });
    });

    it('should reject generic API key integrations for already supported API key providers', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: {
                provider: 'generic-api-key',
                unique_key: 'github-generic',
                generic_api_key: {
                    base_url: 'https://api.github.com/',
                    placement: 'header',
                    name: 'Authorization',
                    value_template: 'Bearer {apiKey}'
                }
            }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                message:
                    'Nango already supports this API through the Github (Personal Access Token) (github-pat) integration. Generic API Key is intended for private APIs or public APIs that Nango does not support yet. Use the provider-specific integration instead.'
            }
        });
    });

    it('should reject generic API key config for non-generic integrations', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: {
                provider: 'algolia',
                unique_key: 'algolia',
                generic_api_key: {
                    base_url: 'https://api.example.com',
                    placement: 'header',
                    name: 'Authorization',
                    value_template: 'Bearer {apiKey}'
                }
            }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'invalid_body', message: 'generic_api_key is only supported for generic-api-key integrations' }
        });
    });

    it('should add webhookSecret when creds.webhook_secret is present', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
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
            token: apiKey.secret,
            params: { uniqueKey: 'github' },
            query: { include: ['credentials'] }
        });

        isSuccess(resGet.json);
        const credentials = resGet.json.data.credentials as { webhook_secret: string | null };
        expect(credentials.webhook_secret).toBe('new_secret');
    });

    it('should not add webhookSecret when creds.webhook_secret is not present', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
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
            token: apiKey.secret,
            params: { uniqueKey: 'github' },
            query: { include: ['credentials'] }
        });

        isSuccess(resGet.json);
        const credentials = resGet.json.data.credentials as { webhook_secret: string | null };
        expect(credentials.webhook_secret).toBeNull();
    });
});
