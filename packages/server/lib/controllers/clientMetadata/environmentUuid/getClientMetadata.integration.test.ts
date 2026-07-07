import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer } from '../../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/oauth/client-metadata/:environmentUuid/:providerConfigKey';
const serverUrl = 'https://api.example.test';

describe(`GET ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('should serve the client metadata document', async () => {
        vi.stubEnv('NANGO_SERVER_URL', serverUrl);
        const { env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'my-mcp', 'mcp-generic');

        const { res, json } = await api.fetch(endpoint, {
            method: 'GET',
            params: { environmentUuid: env.uuid, providerConfigKey: 'my-mcp' }
        });

        isSuccess(json);
        expect(json).toStrictEqual<typeof json>({
            client_id: `${serverUrl}/oauth/client-metadata/${env.uuid}/my-mcp`,
            client_name: 'Nango',
            client_uri: 'https://nango.dev',
            redirect_uris: [`${serverUrl}/oauth/callback`],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: 'none'
        });
        expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    });

    it('should use the integration branding fields when set', async () => {
        vi.stubEnv('NANGO_SERVER_URL', serverUrl);
        const { env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'branded-mcp', 'mcp-generic', {
            custom: {
                oauth_client_name: 'Acme Assistant',
                oauth_client_uri: 'https://acme.example.com',
                oauth_client_logo_uri: 'https://acme.example.com/logo.png'
            }
        });

        const { json } = await api.fetch(endpoint, {
            method: 'GET',
            params: { environmentUuid: env.uuid, providerConfigKey: 'branded-mcp' }
        });

        isSuccess(json);
        expect(json).toMatchObject({
            client_name: 'Acme Assistant',
            client_uri: 'https://acme.example.com',
            logo_uri: 'https://acme.example.com/logo.png'
        });
    });

    it('should use the environment callback url in redirect_uris when set', async () => {
        vi.stubEnv('NANGO_SERVER_URL', serverUrl);
        const { env } = await seeders.seedAccountEnvAndUser();
        await db.knex.from('_nango_environments').where({ id: env.id }).update({ callback_url: 'https://custom.example.com/oauth/callback' });
        await seeders.createConfigSeed(env, 'my-mcp', 'mcp-generic');

        const { json } = await api.fetch(endpoint, {
            method: 'GET',
            params: { environmentUuid: env.uuid, providerConfigKey: 'my-mcp' }
        });

        isSuccess(json);
        expect(json).toMatchObject({
            redirect_uris: ['https://custom.example.com/oauth/callback']
        });
    });

    it('should validate uri params', async () => {
        vi.stubEnv('NANGO_SERVER_URL', serverUrl);
        const { json } = await api.fetch(endpoint, {
            method: 'GET',
            params: { environmentUuid: 'not-a-uuid', providerConfigKey: 'my-mcp' }
        });

        isError(json);
        expect(json.error.code).toBe('invalid_uri_params');
    });

    it('should 404 on unknown environment', async () => {
        vi.stubEnv('NANGO_SERVER_URL', serverUrl);
        const { res, json } = await api.fetch(endpoint, {
            method: 'GET',
            params: { environmentUuid: '00000000-0000-4000-8000-000000000000', providerConfigKey: 'my-mcp' }
        });

        isError(json);
        expect(json.error.code).toBe('unknown_environment');
        expect(res.status).toBe(404);
    });

    it('should 404 on unknown integration', async () => {
        vi.stubEnv('NANGO_SERVER_URL', serverUrl);
        const { env } = await seeders.seedAccountEnvAndUser();

        const { res, json } = await api.fetch(endpoint, {
            method: 'GET',
            params: { environmentUuid: env.uuid, providerConfigKey: 'does-not-exist' }
        });

        isError(json);
        expect(json.error.code).toBe('unknown_provider_config');
        expect(res.status).toBe(404);
    });

    it('should 404 when NANGO_SERVER_URL is not a public https url', async () => {
        vi.stubEnv('NANGO_SERVER_URL', 'http://localhost:3003');
        const { env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'my-mcp', 'mcp-generic');

        const { res, json } = await api.fetch(endpoint, {
            method: 'GET',
            params: { environmentUuid: env.uuid, providerConfigKey: 'my-mcp' }
        });

        isError(json);
        expect(json.error.code).toBe('feature_disabled');
        expect(res.status).toBe(404);
    });
});
