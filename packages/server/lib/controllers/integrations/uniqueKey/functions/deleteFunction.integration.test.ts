import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import { getFlags } from '@nangohq/feature-flags';
import { functionConfigService, seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../../../utils/tests.js';

import type { DBFunctionConfigVersion, DBSyncConfig } from '@nangohq/types';

const route = '/integrations/:uniqueKey/functions/:name';
let api: Awaited<ReturnType<typeof runServer>>;

function nativeVersion(
    source: DBFunctionConfigVersion['source']
): Omit<DBFunctionConfigVersion, 'id' | 'function_config_id' | 'created_at' | 'updated_at' | 'deleted_at'> {
    return {
        description: 'Native function',
        tags: {},
        file_location: 'github/functions/native.js',
        version: 'test-version',
        source,
        trigger: { kind: 'http' },
        requires: { connection: true, outbound: false, invoke: false },
        capabilities: { usesRecords: false, usesOutbound: false, usesCheckpoints: false, usesMetadata: false, usesInvoke: false },
        limits: { concurrency: { perConnection: 'max' } },
        input_schema_ref: null,
        output_schema_ref: null,
        model_schema_refs: [],
        metadata_schema_ref: null,
        checkpoint_schema_ref: null,
        json_schema: {}
    };
}

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
    afterEach(() => {
        vi.restoreAllMocks();
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

    it.each(['tool', 'function'] as const)('should return 404 for a missing %s', async (type) => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(route, { method: 'DELETE', token: apiKey.secret, params: { uniqueKey: 'github', name: 'my-tool' }, query: { type } });

        isError(res.json);
        expect(res.res.status).toBe(404);
        expect(res.json.error.code).toBe('not_found');
    });

    it.each(['tool', 'function'] as const)('should delete a standalone native %s', async (type) => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const [fn] = (
            await functionConfigService.upsert(db.knex, [
                { environmentId: env.id, integrationId: 'github', name: 'native', version: nativeVersion('standalone') }
            ])
        ).unwrap();

        const res = await api.fetch(route, { method: 'DELETE', token: apiKey.secret, params: { uniqueKey: 'github', name: 'native' }, query: { type } });
        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.data.success).toBe(true);
        expect((await functionConfigService.search(db.knex, { environmentId: env.id, filter: { id: fn!.config.id } })).unwrap()).toEqual([]);
        const [deleted] = (
            await functionConfigService.search(db.knex, { environmentId: env.id, filter: { id: fn!.config.id } }, { includeDeleted: true })
        ).unwrap();
        expect(deleted?.config.deleted_at).toBeInstanceOf(Date);
        expect(deleted?.currentVersion.deleted_at).toBeInstanceOf(Date);
    });

    it.each(['tool', 'function'] as const)('should reject a repo-managed native %s', async (type) => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const [fn] = (
            await functionConfigService.upsert(db.knex, [{ environmentId: env.id, integrationId: 'github', name: 'native', version: nativeVersion('repo') }])
        ).unwrap();
        const res = await api.fetch(route, { method: 'DELETE', token: apiKey.secret, params: { uniqueKey: 'github', name: 'native' }, query: { type } });
        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json.error.code).toBe('function_managed_by_deploy');
        expect((await functionConfigService.search(db.knex, { environmentId: env.id, filter: { id: fn!.config.id } })).unwrap()).toHaveLength(1);
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

    it.each(['standalone', 'catalog'] as const)('should delete a legacy %s action requested as a tool', async (source) => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const integration = await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, provider: 'github' });

        const { syncConfig } = await seeders.createSyncSeeds({
            connectionId: connection.id,
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'legacy-action',
            type: 'action',
            source
        });

        const res = await api.fetch(route, {
            method: 'DELETE',
            token: apiKey.secret,
            params: { uniqueKey: 'github', name: 'legacy-action' },
            query: { type: 'tool' }
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect((await getSyncConfig(syncConfig.id))?.deleted).toBe(true);
    });

    it('should reject a tools-catalog tool', async () => {
        vi.spyOn(getFlags(), 'hasCatalogTools').mockResolvedValue(true);
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(route, {
            method: 'DELETE',
            token: apiKey.secret,
            params: { uniqueKey: 'github', name: 'create-issue' },
            query: { type: 'tool' }
        });

        expect(res.res.status).toBe(400);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'invalid_request', message: 'Catalog functions cannot be deleted' }
        });
    });
});
