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
        const { env, secret } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: 'dev' },
            token: secret.secret,
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
            token: secret.secret,
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
            token: secret.secret,
            params: { providerConfigKey: 'github' }
        });

        isError(resOld.json);
        expect(resOld.json).toStrictEqual<typeof resOld.json>({
            error: { code: 'not_found', message: 'Integration "github" does not exist' }
        });
    });

    it('should not be able to rename integration with active connection', async () => {
        const { env, secret } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        await seeders.createConnectionSeed({ env, provider: 'github' });
        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: 'dev' },
            token: secret.secret,
            params: { providerConfigKey: 'github' },
            body: { integrationId: 'renamed' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'invalid_body', message: "Can't rename an integration with active connections" }
        });
    });

    it('should allow scopes with spaces', async () => {
        const { env, secret } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: 'dev' },
            token: secret.secret,
            params: { providerConfigKey: 'github' },
            body: { authType: 'OAUTH2', clientId: 'test-client', clientSecret: 'test-secret', scopes: 'read write,admin access' }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: { success: true }
        });
    });

    it('should update custom fields such as aws_sigv4_config', async () => {
        const { env, secret } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'aws-sigv4', 'aws-sigv4');
        const payload = JSON.stringify({
            service: 's3',
            stsEndpoint: { url: 'https://example.com/hooks' }
        });

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: 'dev' },
            token: secret.secret,
            params: { providerConfigKey: 'aws-sigv4' },
            body: { custom: { aws_sigv4_config: payload } }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: { success: true }
        });

        const resGet = await api.fetch(endpoint, {
            method: 'GET',
            query: { env: 'dev' },
            token: secret.secret,
            params: { providerConfigKey: 'aws-sigv4' }
        });

        isSuccess(resGet.json);
        expect(resGet.json).toMatchObject({
            data: { integration: { custom: { aws_sigv4_config: payload } } }
        });
    });

    it('should reject invalid aws_sigv4_config payloads', async () => {
        const { env, secret } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'aws-sigv4', 'aws-sigv4');
        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: 'dev' },
            token: secret.secret,
            params: { providerConfigKey: 'aws-sigv4' },
            body: { custom: { aws_sigv4_config: '{"service":""' } }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'invalid_body', message: 'aws_sigv4_config must be valid JSON' }
        });

        const resMissingFields = await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: 'dev' },
            token: secret.secret,
            params: { providerConfigKey: 'aws-sigv4' },
            body: { custom: { aws_sigv4_config: JSON.stringify({ service: 's3' }) } }
        });

        isError(resMissingFields.json);
        expect(resMissingFields.json).toStrictEqual<typeof resMissingFields.json>({
            error: { code: 'missing_aws_sigv4_sts_endpoint', message: 'AWS SigV4 integration is missing the STS endpoint configuration.' }
        });
    });

    it('should allow removing aws_sigv4_config', async () => {
        const { env, secret } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'aws-sigv4', 'aws-sigv4');
        const payload = JSON.stringify({
            service: 's3',
            stsEndpoint: { url: 'https://example.com/hooks' }
        });

        await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: 'dev' },
            token: secret.secret,
            params: { providerConfigKey: 'aws-sigv4' },
            body: { custom: { aws_sigv4_config: payload } }
        });

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            query: { env: 'dev' },
            token: secret.secret,
            params: { providerConfigKey: 'aws-sigv4' },
            body: { custom: { aws_sigv4_config: null } }
        });

        isSuccess(res.json);

        const resGet = await api.fetch(endpoint, {
            method: 'GET',
            query: { env: 'dev' },
            token: secret.secret,
            params: { providerConfigKey: 'aws-sigv4' }
        });

        isSuccess(resGet.json);
        const custom = resGet.json.data.integration.custom ?? {};
        expect(custom).not.toHaveProperty('aws_sigv4_config');
    });
});
