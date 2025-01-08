import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { runServer, shouldBeProtected, isSuccess, isError } from '../../../utils/tests.js';
import { seeders } from '@nangohq/shared';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/connection/:connectionId';

describe(`GET ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'GET',
            params: { connectionId: 'test' },
            query: { provider_config_key: 'github' }
        });

        shouldBeProtected(res);
    });

    it('should 404 on unknown provider', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: env.secret_key,
            params: { connectionId: 'test' },
            query: { provider_config_key: 'github' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'unknown_provider_config', message: 'Provider does not exists' }
        });
    });

    it('should 404 on unknown connectionId', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: env.secret_key,
            params: { connectionId: 'test' },
            query: { provider_config_key: 'github' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'not_found', message: 'Failed to find connection' }
        });
    });

    it('should get a connection', async () => {
        const { env, account } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'algolia', 'algolia');
        const endUser = await seeders.createEndUser({ environment: env, account });
        const conn = await seeders.createConnectionSeed({
            env,
            provider: 'algolia',
            endUser,
            rawCredentials: { type: 'API_KEY', apiKey: 'test_api_key' },
            connectionConfig: { APP_ID: 'TEST' }
        });

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: env.secret_key,
            params: { connectionId: conn.connection_id },
            query: { provider_config_key: 'algolia' }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            connection_id: conn.connection_id,
            created_at: expect.toBeIsoDateTimezone(),
            credentials: {
                apiKey: 'test_api_key',
                type: 'API_KEY'
            },
            connection_config: { APP_ID: 'TEST' },
            end_user: {
                display_name: null,
                email: endUser.email,
                id: endUser.endUserId,
                organization: {
                    display_name: null,
                    id: endUser.organization!.organizationId
                }
            },
            errors: [],
            id: expect.any(Number),
            last_fetched_at: expect.toBeIsoDateTimezone(),
            metadata: null,
            provider: 'algolia',
            provider_config_key: 'algolia',
            updated_at: expect.toBeIsoDateTimezone()
        });
    });

    it('should get a connection despite another connection with same name on a different provider', async () => {
        const { env, account } = await seeders.seedAccountEnvAndUser();

        await seeders.createConfigSeed(env, 'algolia', 'algolia');
        const endUser = await seeders.createEndUser({ environment: env, account });
        const conn = await seeders.createConnectionSeed({
            env,
            provider: 'algolia',
            endUser,
            rawCredentials: { type: 'API_KEY', apiKey: 'test_api_key' },
            connectionConfig: { APP_ID: 'TEST' }
        });

        await seeders.createConfigSeed(env, 'google', 'google');
        await seeders.createConnectionSeed({
            env,
            provider: 'google',
            endUser,
            connectionId: conn.connection_id,
            rawCredentials: { type: 'API_KEY', apiKey: 'test_api_key' },
            connectionConfig: { APP_ID: 'TEST' }
        });

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: env.secret_key,
            params: { connectionId: conn.connection_id },
            query: { provider_config_key: 'algolia' }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            connection_id: conn.connection_id,
            created_at: expect.toBeIsoDateTimezone(),
            credentials: {
                apiKey: 'test_api_key',
                type: 'API_KEY'
            },
            connection_config: { APP_ID: 'TEST' },
            end_user: {
                display_name: null,
                email: endUser.email,
                id: endUser.endUserId,
                organization: {
                    display_name: null,
                    id: endUser.organization!.organizationId
                }
            },
            errors: [],
            id: expect.any(Number),
            last_fetched_at: expect.toBeIsoDateTimezone(),
            metadata: null,
            provider: 'algolia',
            provider_config_key: 'algolia',
            updated_at: expect.toBeIsoDateTimezone()
        });
    });
});
