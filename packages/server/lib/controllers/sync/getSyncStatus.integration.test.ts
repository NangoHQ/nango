import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { envs } from '@nangohq/logs';
import { seeders, syncManager } from '@nangohq/shared';

import { isSuccess, runServer, shouldBeProtected } from '../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/sync/status';
const mockGetSyncStatus = vi.spyOn(syncManager, 'getSyncStatus').mockResolvedValue({
    success: true,
    response: [],
    error: null
});

describe(`GET ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
        envs.NANGO_LOGS_ENABLED = false;
    });
    afterAll(() => {
        api.server.close();
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'GET',
            query: {
                syncs: 'sync1',
                provider_config_key: 'test-key'
            }
        });

        shouldBeProtected(res);
    });

    it('should return 400 for for invalid body', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: env.secret_key,
            // @ts-expect-error on purpose
            query: {},
            headers: {}
        });

        expect(res.res.status).toEqual(400);
        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_query_params',
                errors: [
                    {
                        code: 'invalid_type',
                        message: 'Invalid input: expected string, received undefined',
                        path: ['syncs']
                    },
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['provider_config_key'] }
                ]
            }
        });
    });

    it('should handle syncs as comma-separated string', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const integration = await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, provider: integration.provider, config_id: integration.id! });
        await seeders.createSyncSeeds({ connectionId: connection.id, environment_id: env.id, sync_name: 'sync1', nango_config_id: integration.id! });
        await seeders.createSyncSeeds({ connectionId: connection.id, environment_id: env.id, sync_name: 'sync2', nango_config_id: integration.id! });

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: env.secret_key,
            query: {
                syncs: 'sync1,sync2',
                provider_config_key: 'github'
            },
            headers: {}
        });

        expect(mockGetSyncStatus).toHaveBeenCalledWith(
            expect.objectContaining({
                environmentId: env.id,
                providerConfigKey: 'github',
                syncIdentifiers: [
                    { syncName: 'sync1', syncVariant: 'base' },
                    { syncName: 'sync2', syncVariant: 'base' }
                ]
            })
        );
        isSuccess(res.json);
        expect(res.json).toStrictEqual({
            syncs: []
        });
    });

    it('should handle wildcard syncs parameter', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const integration = await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, provider: integration.provider, config_id: integration.id! });
        await seeders.createSyncSeeds({ connectionId: connection.id, environment_id: env.id, sync_name: 'sync1', nango_config_id: integration.id! });
        await seeders.createSyncSeeds({ connectionId: connection.id, environment_id: env.id, sync_name: 'sync2', nango_config_id: integration.id! });

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: env.secret_key,
            query: {
                syncs: '*',
                provider_config_key: integration.unique_key
            },
            headers: {}
        });

        expect(mockGetSyncStatus).toHaveBeenCalledWith(
            expect.objectContaining({
                environmentId: env.id,
                providerConfigKey: 'github',
                syncIdentifiers: [
                    { syncName: 'sync1', syncVariant: 'base' },
                    { syncName: 'sync2', syncVariant: 'base' }
                ]
            })
        );
        isSuccess(res.json);
        expect(res.json).toStrictEqual({
            syncs: []
        });
    });

    it('should handle syncs with variants', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const integration = await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, provider: integration.provider, config_id: integration.id! });
        await seeders.createSyncSeeds({ connectionId: connection.id, environment_id: env.id, sync_name: 'sync3', nango_config_id: integration.id! });
        await seeders.createSyncSeeds({ connectionId: connection.id, environment_id: env.id, sync_name: 'sync4', nango_config_id: integration.id! });

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: env.secret_key,
            query: {
                syncs: 'sync3::v1,sync4::v2',
                provider_config_key: 'github'
            },
            headers: {}
        });

        expect(mockGetSyncStatus).toHaveBeenCalledWith(
            expect.objectContaining({
                environmentId: env.id,
                providerConfigKey: 'github',
                syncIdentifiers: [
                    { syncName: 'sync3', syncVariant: 'v1' },
                    { syncName: 'sync4', syncVariant: 'v2' }
                ]
            })
        );
        isSuccess(res.json);
        expect(res.json).toStrictEqual({
            syncs: []
        });
    });
});
