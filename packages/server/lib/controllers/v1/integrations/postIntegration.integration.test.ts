import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/api/v1/integrations';

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
            query: { env: 'dev' },
            body: { provider: 'github', useSharedCredentials: false }
        });

        shouldBeProtected(res);
    });

    it('should validate the body', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: env.name },
            token: apiKey.secret,
            // @ts-expect-error on purpose
            body: { provider: 'github', useSharedCredentials: 'invalid' }
        });

        isError(res.json);
        expect(res.json.error.code).toBe('invalid_body');
    });

    it('should validate the provider', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: env.name },
            token: apiKey.secret,
            body: { provider: 'invalid-provider', useSharedCredentials: false }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'invalid_body', message: 'invalid provider' }
        });
    });

    it('should validate integrationId uniqueness', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github-unique', 'github');
        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: env.name },
            token: apiKey.secret,
            body: { provider: 'github', useSharedCredentials: false, integrationId: 'github-unique' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'invalid_body', message: 'integrationId is already used by another integration' }
        });
    });

    it('should validate authType compatibility', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: env.name },
            token: apiKey.secret,
            body: {
                provider: 'github',
                useSharedCredentials: false,
                auth: {
                    authType: 'APP',
                    appId: 'test',
                    appLink: 'https://test.com',
                    privateKey: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----'
                }
            }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'invalid_body', message: 'incompatible credentials auth type and provider auth' }
        });
    });

    it('should create an empty integration', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: env.name },
            token: apiKey.secret,
            body: { provider: 'github', useSharedCredentials: false }
        });

        isSuccess(res.json);
        expect(res.json).toMatchObject({
            data: {
                provider: 'github',
                unique_key: 'github',
                forward_webhooks: true
            }
        });
    });

    it('should require generic_api_key config for generic-api-key integrations', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: env.name },
            token: apiKey.secret,
            body: { provider: 'generic-api-key', useSharedCredentials: false }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'invalid_body', message: 'Missing generic_api_key configuration' }
        });
    });

    it('should reject generic-api-key integrations for already supported API key providers', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: env.name },
            token: apiKey.secret,
            body: {
                provider: 'generic-api-key',
                useSharedCredentials: false,
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

    it('should create a generic-api-key integration with auth presentation config', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: env.name },
            token: apiKey.secret,
            body: {
                provider: 'generic-api-key',
                useSharedCredentials: false,
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
        expect(res.json).toMatchObject({
            data: {
                provider: 'generic-api-key',
                unique_key: 'generic-api-key',
                custom: {
                    generic_api_key_base_url: 'https://api.example.com',
                    generic_api_key_placement: 'header',
                    generic_api_key_name: 'Authorization',
                    generic_api_key_value_template: 'Bearer {apiKey}',
                    generic_api_key_verification_method: 'GET',
                    generic_api_key_verification_endpoint: '/v1/me'
                }
            }
        });
    });

    it('should create an integration with custom integrationId', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: env.name },
            token: apiKey.secret,
            body: { provider: 'github', useSharedCredentials: false, integrationId: 'custom-github' }
        });

        isSuccess(res.json);
        expect(res.json).toMatchObject({
            data: {
                provider: 'github',
                unique_key: 'custom-github',
                forward_webhooks: true
            }
        });
    });

    it('should create an integration with displayName', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: env.name },
            token: apiKey.secret,
            body: { provider: 'github', useSharedCredentials: false, displayName: 'My GitHub Integration' }
        });

        isSuccess(res.json);
        expect(res.json).toMatchObject({
            data: {
                provider: 'github',
                display_name: 'My GitHub Integration',
                forward_webhooks: true
            }
        });
    });

    it('should create an integration with forward_webhooks set to false', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: env.name },
            token: apiKey.secret,
            body: { provider: 'github', useSharedCredentials: false, forward_webhooks: false }
        });

        isSuccess(res.json);
        expect(res.json).toMatchObject({
            data: {
                provider: 'github',
                forward_webhooks: false
            }
        });
    });

    it('should create an integration with OAUTH2 credentials', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: env.name },
            token: apiKey.secret,
            body: {
                provider: 'github',
                useSharedCredentials: false,
                auth: {
                    authType: 'OAUTH2',
                    clientId: 'test-client-id',
                    clientSecret: 'test-client-secret',
                    scopes: 'read,write'
                }
            }
        });

        isSuccess(res.json);
        expect(res.json).toMatchObject({
            data: {
                provider: 'github',
                forward_webhooks: true
            }
        });

        // Verify credentials were set by fetching the integration
        const resGet = await api.fetch('/api/v1/integrations/:providerConfigKey', {
            method: 'GET',
            query: { env: 'dev' },
            token: apiKey.secret,
            params: { providerConfigKey: 'github' }
        });

        isSuccess(resGet.json);
        expect(resGet.json.data.integration.oauth_client_id).toBe('test-client-id');
    });

    it('should create an integration with all fields', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: env.name },
            token: apiKey.secret,
            body: {
                provider: 'github',
                useSharedCredentials: false,
                integrationId: 'full-integration',
                displayName: 'Full Integration',
                forward_webhooks: false,
                auth: {
                    authType: 'OAUTH2',
                    clientId: 'full-client-id',
                    clientSecret: 'full-client-secret',
                    scopes: 'read,write,admin'
                }
            }
        });

        isSuccess(res.json);
        expect(res.json).toMatchObject({
            data: {
                provider: 'github',
                unique_key: 'full-integration',
                display_name: 'Full Integration',
                forward_webhooks: false
            }
        });

        // Verify all fields were set
        const resGet = await api.fetch('/api/v1/integrations/:providerConfigKey', {
            method: 'GET',
            query: { env: 'dev' },
            token: apiKey.secret,
            params: { providerConfigKey: 'full-integration' }
        });

        isSuccess(resGet.json);
        expect(resGet.json.data.integration.unique_key).toBe('full-integration');
        expect(resGet.json.data.integration.display_name).toBe('Full Integration');
        expect(resGet.json.data.integration.forward_webhooks).toBe(false);
        expect(resGet.json.data.integration.oauth_client_id).toBe('full-client-id');
    });

    it('should create integration with shared credentials', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createSharedCredentialsSeed('github');
        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'dev' },
            token: apiKey.secret,
            body: { provider: 'github', useSharedCredentials: true }
        });

        isSuccess(res.json);
        expect(res.json).toMatchObject({
            data: {
                provider: 'github',
                forward_webhooks: true
            }
        });
    });

    it('should create integration with shared credentials and custom integrationId', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createSharedCredentialsSeed('github');
        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'dev' },
            token: apiKey.secret,
            body: {
                provider: 'github',
                useSharedCredentials: true,
                integrationId: 'shared-github-custom'
            }
        });

        isSuccess(res.json);
        expect(res.json).toMatchObject({
            data: {
                provider: 'github',
                unique_key: 'shared-github-custom',
                forward_webhooks: true
            }
        });
    });

    it('should generate unique key when provider name already exists', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: env.name },
            token: apiKey.secret,
            body: { provider: 'github', useSharedCredentials: false }
        });

        isSuccess(res.json);
        expect(res.json.data.unique_key).toMatch(/^github-[a-z0-9]{4}$/);
    });

    it('should allow scopes with spaces', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: env.name },
            token: apiKey.secret,
            body: {
                provider: 'github',
                useSharedCredentials: false,
                auth: {
                    authType: 'OAUTH2',
                    clientId: 'test-client',
                    clientSecret: 'test-secret',
                    scopes: 'read write,admin access'
                }
            }
        });

        isSuccess(res.json);
        expect(res.json).toMatchObject({
            data: {
                provider: 'github',
                forward_webhooks: true
            }
        });
    });
});
