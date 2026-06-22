import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../../../utils/tests.js';

import type { DBSyncConfig } from '@nangohq/types';

const route = '/integrations/:uniqueKey/functions/:name';
let api: Awaited<ReturnType<typeof runServer>>;

async function getSyncConfig(id: number): Promise<Pick<DBSyncConfig, 'id' | 'deleted' | 'active'> | undefined> {
    return db.knex.from<DBSyncConfig>('_nango_sync_configs').select('id', 'deleted', 'active').where({ id }).first();
}

async function seedWithScopes(scopes: string[]) {
    const seed = await seeders.seedAccountEnvAndUser();
    await db.knex('customer_keys').where('id', seed.apiKey.id).update({ scopes });
    return seed;
}

describe(`DELETE ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, { method: 'DELETE', params: { uniqueKey: 'github', name: 'my-sync' }, query: { type: 'sync' } });

        shouldBeProtected(res);
    });

    it('should reject a key lacking the delete scope', async () => {
        const seed = await seedWithScopes(['environment:functions:read']);

        const res = await api.fetch(route, {
            method: 'DELETE',
            token: seed.apiKey.secret,
            params: { uniqueKey: 'github', name: 'my-sync' },
            query: { type: 'sync' }
        });

        isError(res.json);
        expect(res.res.status).toBe(403);
        expect(res.json.error.code).toBe('forbidden');
    });

    it('should require the type query param', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(route, {
            method: 'DELETE',
            token: apiKey.secret,
            params: { uniqueKey: 'github', name: 'my-sync' },
            // @ts-expect-error missing type on purpose
            query: {}
        });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json.error.code).toBe('invalid_query_params');
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
            token: apiKey.secret,
            params: { uniqueKey: 'github', name: 'repo-sync' },
            query: { type: 'sync' }
        });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json.error.code).toBe('function_managed_by_deploy');

        const after = await getSyncConfig(syncConfig.id);
        expect(after?.deleted).toBe(false);
    });

    it('should soft-delete a standalone function and accept the teardown', async () => {
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
            token: apiKey.secret,
            params: { uniqueKey: 'github', name: 'standalone-sync' },
            query: { type: 'sync' }
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.data.success).toBe(true);

        const after = await getSyncConfig(syncConfig.id);
        expect(after?.deleted).toBe(true);
        expect(after?.active).toBe(false);
    });
});
