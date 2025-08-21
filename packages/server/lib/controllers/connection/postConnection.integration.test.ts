import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/connections';

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
            body: {}
        });

        shouldBeProtected(res);
    });

    it('should validate oauth2 credentials', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            // @ts-expect-error on purpose
            body: { provider_config_key: 'github', credentials: { type: 'OAUTH2' } }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                errors: [{ code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['credentials', 'access_token'] }]
            }
        });
    });

    it('should validate oauth2_cc credentials', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            // @ts-expect-error on purpose
            body: { provider_config_key: 'github', credentials: { type: 'OAUTH2_CC' } }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                errors: [
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['credentials', 'token'] },
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['credentials', 'client_id'] },
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['credentials', 'client_secret'] }
                ]
            }
        });
    });

    it('should validate oauth1 credentials', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            // @ts-expect-error on purpose
            body: { provider_config_key: 'github', credentials: { type: 'OAUTH1' } }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                errors: [
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['credentials', 'oauth_token'] },
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['credentials', 'oauth_token_secret'] }
                ]
            }
        });
    });

    it('should validate basic credentials', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            // @ts-expect-error on purpose
            body: { provider_config_key: 'github', credentials: { type: 'BASIC' } }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                errors: [
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['credentials', 'username'] },
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['credentials', 'password'] }
                ]
            }
        });
    });

    it('should validate none credentials', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            // @ts-expect-error on purpose
            body: { provider_config_key: 'unauthenticated', credentials: { type: 'NONE', foo: 'bar' } }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                errors: [{ code: 'unrecognized_keys', message: 'Unrecognized key: "foo"', path: ['credentials'] }]
            }
        });
    });

    it('should validate TBA credentials', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            // @ts-expect-error on purpose
            body: { provider_config_key: 'github', credentials: { type: 'TBA' } }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                errors: [
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['credentials', 'token_id'] },
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['credentials', 'token_secret'] }
                ]
            }
        });
    });

    it('should validate APP credentials', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            // @ts-expect-error on purpose
            body: { provider_config_key: 'github', credentials: { type: 'APP' } }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                errors: [
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['credentials', 'app_id'] },
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['credentials', 'installation_id'] }
                ]
            }
        });
    });

    it('should import oauth2 connection', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            // @ts-expect-error on purpose
            body: { provider_config_key: 'github', credentials: { type: 'OAUTH2', access_token: '123' } }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            connection_config: {},
            connection_id: expect.any(String),
            created_at: expect.toBeIsoDate(),
            credentials: {
                access_token: '123',
                raw: {
                    access_token: '123',
                    type: 'OAUTH2'
                },
                type: 'OAUTH2'
            },
            end_user: null,
            errors: [],
            id: expect.any(Number),
            last_fetched_at: expect.toBeIsoDate(),
            metadata: {},
            provider: 'github',
            provider_config_key: 'github',
            updated_at: expect.toBeIsoDate()
        });
    });
});
