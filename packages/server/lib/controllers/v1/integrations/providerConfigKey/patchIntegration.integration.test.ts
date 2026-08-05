import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configService, seeders } from '@nangohq/shared';

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

    it('stores aws-sigv4 integration_config as flat custom fields', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'aws-sigv4', 'aws-sigv4');

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: 'dev' },
            token: apiKey.secret,
            params: { providerConfigKey: 'aws-sigv4' },
            body: { integrationConfig: { service: 's3', stsMode: 'custom', stsEndpointUrl: 'https://example.com/hooks' } }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({ data: { success: true } });

        const resGet = await api.fetch(endpoint, {
            method: 'GET',
            query: { env: 'dev' },
            token: apiKey.secret,
            params: { providerConfigKey: 'aws-sigv4' }
        });

        isSuccess(resGet.json);
        expect(resGet.json).toMatchObject({
            data: { integration: { custom: { service: 's3', stsMode: 'custom', stsEndpointUrl: 'https://example.com/hooks' } } }
        });
    });

    it('rejects invalid integration_config values', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'aws-sigv4', 'aws-sigv4');

        // Bad URL for a visible (custom mode) field
        const badUrl = await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: 'dev' },
            token: apiKey.secret,
            params: { providerConfigKey: 'aws-sigv4' },
            body: { integrationConfig: { stsMode: 'custom', stsEndpointUrl: 'not-a-url' } }
        });
        isError(badUrl.json);
        expect(badUrl.json.error.code).toBe('invalid_body');

        // Unknown field
        const unknown = await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: 'dev' },
            token: apiKey.secret,
            params: { providerConfigKey: 'aws-sigv4' },
            body: { integrationConfig: { bogusField: 'x' } }
        });
        isError(unknown.json);
        expect(unknown.json.error.code).toBe('invalid_body');
    });

    it('stores builtin credentials and redacts them on read', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'aws-sigv4', 'aws-sigv4');

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: 'dev' },
            token: apiKey.secret,
            params: { providerConfigKey: 'aws-sigv4' },
            body: { integrationConfig: { service: 's3', stsMode: 'builtin', awsAccessKeyId: 'AKIATESTKEY123', awsSecretAccessKey: 'testSecretKey456' } }
        });
        isSuccess(res.json);

        // Secrets are masked ("***") on read, never echoed in cleartext.
        const resGet = await api.fetch(endpoint, {
            method: 'GET',
            query: { env: 'dev' },
            token: apiKey.secret,
            params: { providerConfigKey: 'aws-sigv4' }
        });

        isSuccess(resGet.json);
        expect(resGet.json.data.integration.custom).toMatchObject({
            stsMode: 'builtin',
            awsAccessKeyId: '***',
            awsSecretAccessKey: '***'
        });
    });

    it('accepts builtin mode without credentials (cross-field validation is deferred to connect time)', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'aws-sigv4', 'aws-sigv4');

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: 'dev' },
            token: apiKey.secret,
            params: { providerConfigKey: 'aws-sigv4' },
            body: { integrationConfig: { service: 's3', stsMode: 'builtin' } }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({ data: { success: true } });
    });

    it('clears an optional field when patched with an empty value', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'aws-sigv4', 'aws-sigv4');

        await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: 'dev' },
            token: apiKey.secret,
            params: { providerConfigKey: 'aws-sigv4' },
            body: { integrationConfig: { service: 's3', stsMode: 'custom', stsEndpointUrl: 'https://example.com/hooks' } }
        });

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: 'dev' },
            token: apiKey.secret,
            params: { providerConfigKey: 'aws-sigv4' },
            body: { integrationConfig: { stsEndpointUrl: '' } }
        });
        isSuccess(res.json);

        const resGet = await api.fetch(endpoint, {
            method: 'GET',
            query: { env: 'dev' },
            token: apiKey.secret,
            params: { providerConfigKey: 'aws-sigv4' }
        });

        isSuccess(resGet.json);
        expect(resGet.json.data.integration.custom?.['stsEndpointUrl']).toBe('');
    });

    it('rejects client credential updates for MCP integrations with managed client registration', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        // amplitude-mcp uses client_registration: dynamic, its client_id is managed by Nango
        await seeders.createConfigSeed(env, 'amplitude-mcp', 'amplitude-mcp');

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: 'dev' },
            token: apiKey.secret,
            params: { providerConfigKey: 'amplitude-mcp' },
            body: { authType: 'MCP_OAUTH2', clientId: 'attacker-client-id' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'invalid_body', message: "Client credentials can't be updated for dynamic client registration" }
        });
    });

    it('allows scope updates for MCP integrations with managed client registration', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'amplitude-mcp', 'amplitude-mcp');

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: 'dev' },
            token: apiKey.secret,
            params: { providerConfigKey: 'amplitude-mcp' },
            body: { authType: 'MCP_OAUTH2', scopes: 'read write' }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({ data: { success: true } });
    });

    it('allows client credential updates for MCP integrations with static client registration', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        // asana-mcp uses client_registration: static, users bring their own credentials
        await seeders.createConfigSeed(env, 'asana-mcp', 'asana-mcp');

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: 'dev' },
            token: apiKey.secret,
            params: { providerConfigKey: 'asana-mcp' },
            body: { authType: 'MCP_OAUTH2', clientId: 'my-client-id', clientSecret: 'my-client-secret' }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({ data: { success: true } });
    });

    it('actually persists an updated integration_config secret across successive updates', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'sage-intacct-cc', 'sage-intacct-cc');

        await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: 'dev' },
            token: apiKey.secret,
            params: { providerConfigKey: 'sage-intacct-cc' },
            body: { integrationConfig: { clientId: 'first-client-id', clientSecret: 'first-secret' } }
        });

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: 'dev' },
            token: apiKey.secret,
            params: { providerConfigKey: 'sage-intacct-cc' },
            body: { integrationConfig: { clientSecret: 'second-secret' } }
        });
        isSuccess(res.json);

        const stored = await configService.getProviderConfig('sage-intacct-cc', env.id);
        expect(stored?.custom).toMatchObject({ clientId: 'first-client-id', clientSecret: 'second-secret' });
    });
});
