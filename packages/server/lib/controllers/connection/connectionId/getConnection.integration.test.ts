import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connectionService, seeders } from '@nangohq/shared';
import { MAX_CONSECUTIVE_DAYS_FAILED_REFRESH } from '@nangohq/shared/lib/services/connections/utils.js';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../../utils/tests.js';

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
                tags: { origin: 'test' },
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
                tags: { origin: 'test' },
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
    it('should return an error if connection refreshs are exhausted', async () => {
        const provider = 'hubspot';
        const { env, account } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, provider, provider);
        const endUser = await seeders.createEndUser({ environment: env, account });
        const conn = await seeders.createConnectionSeed({
            env,
            provider,
            endUser,
            rawCredentials: { type: 'OAUTH2', access_token: 'test_access_token', raw: {} }
        });
        await connectionService.setRefreshFailure({
            id: conn.id,
            lastRefreshFailure: new Date(),
            currentAttempt: MAX_CONSECUTIVE_DAYS_FAILED_REFRESH
        });

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: env.secret_key,
            params: { connectionId: conn.connection_id },
            query: { provider_config_key: provider }
        });

        expect(res.res.status).toBe(424);
        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_credentials',
                message: 'The refresh limit has been reached for this connection.',
                payload: {
                    connection: {
                        id: conn.id,
                        connection_id: conn.connection_id,
                        created_at: expect.toBeIsoDateTimezone(),
                        credentials: {},
                        connection_config: {},
                        end_user: {
                            display_name: null,
                            email: endUser.email,
                            id: endUser.endUserId,
                            tags: { origin: 'test' },
                            organization: {
                                display_name: null,
                                id: endUser.organization!.organizationId
                            }
                        },
                        errors: [],
                        last_fetched_at: expect.toBeIsoDateTimezone(),
                        metadata: null,
                        provider,
                        provider_config_key: provider,
                        updated_at: expect.toBeIsoDateTimezone()
                    }
                }
            }
        });
    });
    it('should return an error if connection fails to refresh', async () => {
        const provider = 'hubspot';
        const { env, account } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, provider, provider);
        const endUser = await seeders.createEndUser({ environment: env, account });
        const conn = await seeders.createConnectionSeed({
            env,
            provider,
            endUser,
            rawCredentials: { type: 'OAUTH2', access_token: 'test_access_token', refresh_token: 'not_working', raw: {} }
        });

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: env.secret_key,
            params: { connectionId: conn.connection_id },
            query: { provider_config_key: provider, force_refresh: true }
        });

        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_credentials',
                message: 'The external API returned an error when trying to refresh the access token. Please try again later.',
                payload: {
                    connection: {
                        id: conn.id,
                        connection_id: conn.connection_id,
                        created_at: expect.toBeIsoDateTimezone(),
                        credentials: {},
                        connection_config: {},
                        end_user: {
                            display_name: null,
                            email: endUser.email,
                            id: endUser.endUserId,
                            tags: { origin: 'test' },
                            organization: {
                                display_name: null,
                                id: endUser.organization!.organizationId
                            }
                        },
                        errors: [
                            {
                                log_id: expect.any(String),
                                type: 'auth'
                            }
                        ],
                        last_fetched_at: expect.toBeIsoDateTimezone(),
                        metadata: null,
                        provider: provider,
                        provider_config_key: provider,
                        updated_at: expect.toBeIsoDateTimezone()
                    }
                }
            }
        });
    });
});
