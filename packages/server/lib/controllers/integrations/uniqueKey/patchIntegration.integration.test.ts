import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configService, seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/integrations/:uniqueKey';

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
            // @ts-expect-error on purpose
            body: { provider: 'github' }
        });

        shouldBeProtected(res);
    });

    it('should validate the body', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            token: apiKey.secret,
            params: { uniqueKey: 'github' },
            // @ts-expect-error on purpose
            body: { unique_key: '1832_@$ùé&', display_name: false, credentials: { type: 'INVALID' } }
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

    it('should update an integration', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            token: apiKey.secret,
            params: { uniqueKey: 'github' },
            body: { display_name: 'DISPLAY' }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: {
                created_at: expect.toBeIsoDate(),
                display_name: 'DISPLAY',
                logo: 'http://localhost:3003/images/template-logos/github.svg',
                provider: 'github',
                unique_key: 'github',
                updated_at: expect.toBeIsoDate(),
                forward_webhooks: true
            }
        });
    });

    it('should update generic API key auth presentation config', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'my-api', 'generic-api-key', {
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
            token: apiKey.secret,
            params: { uniqueKey: 'my-api' },
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
        expect(res.json.data.generic_api_key).toStrictEqual({
            base_url: 'https://api.example.com',
            placement: 'query',
            name: 'api_key',
            value_template: '{apiKey}'
        });

        const config = await configService.getProviderConfig('my-api', env.id);
        expect(config?.custom).toMatchObject({
            generic_api_key_base_url: 'https://api.example.com',
            generic_api_key_placement: 'query',
            generic_api_key_name: 'api_key',
            generic_api_key_value_template: '{apiKey}',
            generic_api_key_verification_method: '',
            generic_api_key_verification_endpoint: ''
        });
    });

    it('should reject generic API key base URL updates for already supported API key providers', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'my-api', 'generic-api-key', {
            custom: {
                generic_api_key_base_url: 'https://api.example.com',
                generic_api_key_placement: 'header',
                generic_api_key_name: 'Authorization',
                generic_api_key_value_template: 'Bearer {apiKey}'
            }
        });

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            token: apiKey.secret,
            params: { uniqueKey: 'my-api' },
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

    it('should be able to rename integration', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            token: apiKey.secret,
            params: { uniqueKey: 'github' },
            body: { unique_key: 'renamed' }
        });

        isSuccess(res.json);
        expect(res.json.data.unique_key).toBe('renamed');

        // Get renamed integration
        const resGet = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            query: {},
            params: { uniqueKey: 'renamed' }
        });
        isSuccess(resGet.json);
        expect(resGet.json).toMatchObject({
            data: { unique_key: 'renamed' }
        });

        // Old name should not exists
        const resOld = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            query: {},
            params: { uniqueKey: 'github' }
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
            token: apiKey.secret,
            params: { uniqueKey: 'github' },
            body: { unique_key: 'renamed' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'invalid_body', message: "Can't rename an integration with active connections" }
        });
    });

    it('should update webhook_secret for OAUTH2 integration', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            token: apiKey.secret,
            params: { uniqueKey: 'github' },
            body: { credentials: { type: 'OAUTH2', client_id: 'client_id', client_secret: 'client_secret', webhook_secret: 'new_secret' } }
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

        const resGet = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            params: { uniqueKey: 'github' },
            query: { include: ['credentials'] }
        });

        isSuccess(resGet.json);
        const credentials = resGet.json.data.credentials as { webhook_secret?: string };
        expect(credentials?.webhook_secret).toBe('new_secret');
    });
});
