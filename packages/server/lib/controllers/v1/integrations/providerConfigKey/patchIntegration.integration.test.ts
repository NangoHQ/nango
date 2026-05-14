import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/api/v1/integrations/:providerConfigKey';

describe(`PATCH ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: 'dev' },
            params: { providerConfigKey: 'github' },
            body: { integrationId: 'test' }
        });

        shouldBeProtected(res);
    });

    it('should be able to rename integration', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: 'dev' },
            token: apiKey.secret,
            params: { providerConfigKey: 'github' },
            body: { integrationId: 'renamed' }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: { success: true }
        });

        // Get renamed integration
        const resGet = await api.fetch(endpoint, {
            method: 'GET',
            query: { env: 'dev' },
            token: apiKey.secret,
            params: { providerConfigKey: 'renamed' }
        });
        isSuccess(resGet.json);
        expect(resGet.json).toMatchObject({
            data: { integration: { unique_key: 'renamed' } }
        });

        // Old name should not exists
        const resOld = await api.fetch(endpoint, {
            method: 'GET',
            query: { env: 'dev' },
            token: apiKey.secret,
            params: { providerConfigKey: 'github' }
        });

        isError(resOld.json);
        expect(resOld.json).toStrictEqual<typeof resOld.json>({
            error: { code: 'not_found', message: 'Integration "github" does not exist' }
        });
    });

    it('should not be able to rename integration with active connection', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        await seeders.createConnectionSeed({ env, provider: 'github' });
        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: 'dev' },
            token: apiKey.secret,
            params: { providerConfigKey: 'github' },
            body: { integrationId: 'renamed' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'invalid_body', message: "Can't rename an integration with active connections" }
        });
    });

    it('should allow scopes with spaces', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: 'dev' },
            token: apiKey.secret,
            params: { providerConfigKey: 'github' },
            body: { authType: 'OAUTH2', clientId: 'test-client', clientSecret: 'test-secret', scopes: 'read write,admin access' }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: { success: true }
        });
    });

    it('should update generic-api-key auth presentation config', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'generic-api-key', 'generic-api-key', {
            custom: {
                generic_api_key_base_url: 'https://api.old.com',
                generic_api_key_placement: 'header',
                generic_api_key_name: 'Authorization',
                generic_api_key_value_template: 'Bearer {apiKey}',
                generic_api_key_verification_method: 'GET',
                generic_api_key_verification_endpoint: '/old-verify'
            }
        });

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: env.name },
            token: apiKey.secret,
            params: { providerConfigKey: 'generic-api-key' },
            body: {
                generic_api_key: {
                    base_url: 'https://api.example.com',
                    placement: 'query',
                    name: 'api_key',
                    value_template: '{apiKey}',
                    verification: {
                        method: 'POST',
                        endpoint: '/verify'
                    }
                }
            }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: { success: true }
        });

        const resGet = await api.fetch(endpoint, {
            method: 'GET',
            query: { env: env.name },
            token: apiKey.secret,
            params: { providerConfigKey: 'generic-api-key' }
        });

        isSuccess(resGet.json);
        expect(resGet.json).toMatchObject({
            data: {
                integration: {
                    custom: {
                        generic_api_key_base_url: 'https://api.example.com',
                        generic_api_key_placement: 'query',
                        generic_api_key_name: 'api_key',
                        generic_api_key_value_template: '{apiKey}',
                        generic_api_key_verification_method: 'POST',
                        generic_api_key_verification_endpoint: '/verify'
                    }
                }
            }
        });
    });

    it('should clear generic-api-key verification config when omitted from update', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'generic-api-key', 'generic-api-key', {
            custom: {
                generic_api_key_base_url: 'https://api.old.com',
                generic_api_key_placement: 'header',
                generic_api_key_name: 'Authorization',
                generic_api_key_value_template: 'Bearer {apiKey}',
                generic_api_key_verification_method: 'GET',
                generic_api_key_verification_endpoint: '/old-verify'
            }
        });

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: env.name },
            token: apiKey.secret,
            params: { providerConfigKey: 'generic-api-key' },
            body: {
                generic_api_key: {
                    base_url: 'https://api.example.com',
                    placement: 'query',
                    name: 'api_key',
                    value_template: '{apiKey}'
                }
            }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: { success: true }
        });

        const resGet = await api.fetch(endpoint, {
            method: 'GET',
            query: { env: env.name },
            token: apiKey.secret,
            params: { providerConfigKey: 'generic-api-key' }
        });

        isSuccess(resGet.json);
        expect(resGet.json).toMatchObject({
            data: {
                integration: {
                    custom: {
                        generic_api_key_base_url: 'https://api.example.com',
                        generic_api_key_placement: 'query',
                        generic_api_key_name: 'api_key',
                        generic_api_key_value_template: '{apiKey}',
                        generic_api_key_verification_method: '',
                        generic_api_key_verification_endpoint: ''
                    }
                }
            }
        });
    });

    it('should reject generic-api-key auth presentation updates for already supported API key providers', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'generic-api-key', 'generic-api-key', {
            custom: {
                generic_api_key_base_url: 'https://api.example.com',
                generic_api_key_placement: 'header',
                generic_api_key_name: 'Authorization',
                generic_api_key_value_template: 'Bearer {apiKey}'
            }
        });

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: env.name },
            token: apiKey.secret,
            params: { providerConfigKey: 'generic-api-key' },
            body: {
                generic_api_key: {
                    base_url: 'https://api.github.com',
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
});
