import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getActionsByProviderConfigKey, getSyncConfigsByParams, seeders } from '@nangohq/shared';

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

    it('should auto-deploy catalog actions when the integration is created', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: env.name },
            token: apiKey.secret,
            body: { provider: 'bitdefender', useSharedCredentials: false, integrationId: 'bitdefender-actions' }
        });

        isSuccess(res.json);
        const actions = await getActionsByProviderConfigKey(env.id, 'bitdefender-actions');
        expect(actions).toHaveLength(1);
        expect(actions[0]).toMatchObject({
            sync_name: 'get-company-details',
            type: 'action',
            source: 'catalog',
            enabled: true
        });
    });

    it('should not auto-deploy syncs', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: env.name },
            token: apiKey.secret,
            body: { provider: 'google', useSharedCredentials: false, integrationId: 'google-no-actions' }
        });

        isSuccess(res.json);
        const actions = await getActionsByProviderConfigKey(env.id, 'google-no-actions');
        const syncs = await getSyncConfigsByParams(env.id, 'google-no-actions', false);
        expect(actions).toEqual([]);
        expect(syncs).toEqual([]);
    });

    it('should still create the integration when catalog deploy is blocked by an expired trial', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser({
            plan: { auto_idle: true, trial_end_at: new Date(Date.now() - 60_000) }
        });
        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: env.name },
            token: apiKey.secret,
            body: { provider: 'bitdefender', useSharedCredentials: false, integrationId: 'bitdefender-idle' }
        });

        isSuccess(res.json);
        const actions = await getActionsByProviderConfigKey(env.id, 'bitdefender-idle');
        expect(actions).toEqual([]);
    });
});
