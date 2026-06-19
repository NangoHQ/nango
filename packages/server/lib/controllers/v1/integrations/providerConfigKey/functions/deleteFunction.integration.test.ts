import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../../../utils/tests.js';

import type { DBSyncConfig } from '@nangohq/types';

const route = '/api/v1/integrations/:providerConfigKey/functions/:functionName';
let api: Awaited<ReturnType<typeof runServer>>;

async function getSyncConfig(id: number): Promise<Pick<DBSyncConfig, 'id' | 'deleted' | 'active'> | undefined> {
    return db.knex.from<DBSyncConfig>('_nango_sync_configs').select('id', 'deleted', 'active').where({ id }).first();
}

describe(`DELETE ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, {
            method: 'DELETE',
            query: { env: 'dev', type: 'sync' },
            params: { providerConfigKey: 'test', functionName: 'some-fn' }
        });
        shouldBeProtected(res);
    });

    it('should enforce env query params', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'DELETE',
            // @ts-expect-error missing env on purpose; type is supplied so only env is flagged
            query: { type: 'sync' },
            token: apiKey.secret,
            params: { providerConfigKey: 'test', functionName: 'some-fn' }
        });
        shouldRequireQueryEnv(res);
    });

    it('should require the type query param', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(route, {
            method: 'DELETE',
            // @ts-expect-error missing type on purpose
            query: { env: 'dev' },
            params: { providerConfigKey: 'github', functionName: 'my-sync' },
            token: apiKey.secret
        });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json.error.code).toBe('invalid_query_params');
    });

    it('should reject the on-event type', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(route, {
            method: 'DELETE',
            // @ts-expect-error on-event is not deletable through this endpoint
            query: { env: 'dev', type: 'on-event' },
            params: { providerConfigKey: 'github', functionName: 'my-on-event' },
            token: apiKey.secret
        });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json.error.code).toBe('invalid_query_params');
    });

    it('should 404 when integration does not exist', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'DELETE',
            query: { env: 'dev', type: 'sync' },
            params: { providerConfigKey: 'missing', functionName: 'some-fn' },
            token: apiKey.secret
        });

        isError(res.json);
        expect(res.res.status).toBe(404);
        expect(res.json.error.code).toBe('not_found');
    });

    it('should 404 when function does not exist on the integration', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(route, {
            method: 'DELETE',
            query: { env: 'dev', type: 'sync' },
            params: { providerConfigKey: 'github', functionName: 'does-not-exist' },
            token: apiKey.secret
        });

        isError(res.json);
        expect(res.res.status).toBe(404);
        expect(res.json.error.code).toBe('not_found');
    });

    it('should reject repo functions (managed by nango deploy)', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const integration = await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, provider: 'github' });

        const { syncConfig } = await seeders.createSyncSeeds({
            connectionId: connection.id,
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'repo-sync',
            type: 'sync',
            source: 'repo'
        });

        const res = await api.fetch(route, {
            method: 'DELETE',
            query: { env: 'dev', type: 'sync' },
            params: { providerConfigKey: 'github', functionName: 'repo-sync' },
            token: apiKey.secret
        });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json.error.code).toBe('function_managed_by_deploy');

        // The config must NOT be soft-deleted when rejected.
        const after = await getSyncConfig(syncConfig.id);
        expect(after?.deleted).toBe(false);
    });

    it('should soft-delete a standalone sync function and accept the teardown', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const integration = await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, provider: 'github' });

        const { syncConfig } = await seeders.createSyncSeeds({
            connectionId: connection.id,
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'standalone-sync',
            type: 'sync',
            source: 'standalone'
        });

        const res = await api.fetch(route, {
            method: 'DELETE',
            query: { env: 'dev', type: 'sync' },
            params: { providerConfigKey: 'github', functionName: 'standalone-sync' },
            token: apiKey.secret
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.data.success).toBe(true);

        const after = await getSyncConfig(syncConfig.id);
        expect(after?.deleted).toBe(true);
        expect(after?.active).toBe(false);
    });

    it('should soft-delete a standalone action function', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const integration = await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, provider: 'github' });

        const { syncConfig } = await seeders.createSyncSeeds({
            connectionId: connection.id,
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'standalone-action',
            type: 'action',
            source: 'standalone'
        });

        const res = await api.fetch(route, {
            method: 'DELETE',
            query: { env: 'dev', type: 'action' },
            params: { providerConfigKey: 'github', functionName: 'standalone-action' },
            token: apiKey.secret
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);

        const after = await getSyncConfig(syncConfig.id);
        expect(after?.deleted).toBe(true);
    });
});
