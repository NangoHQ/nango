import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { records } from '@nangohq/records';
import { createSync, seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../../../utils/tests.js';

import type { DBEnvironment } from '@nangohq/types';

const route = '/api/v1/connections/:connectionId/syncs';
let api: Awaited<ReturnType<typeof runServer>>;

const { createConfigSeed, createConnectionSeed, createSyncSeeds, createSyncJobSeeds, seedAccountEnvAndUser } = seeders;

/** A connection with `variants` extra variants of `sync_name`, on top of the seeded `base`. */
async function seedConnectionWithSyncs({
    env,
    syncName = 'emails',
    variants = [],
    models = ['Email']
}: {
    env: DBEnvironment;
    syncName?: string;
    variants?: string[];
    models?: string[];
}) {
    const integration = await createConfigSeed(env, 'github', 'github');
    const connection = await createConnectionSeed({ env, provider: 'github' });
    const { syncConfig, sync } = await createSyncSeeds({
        connectionId: connection.id,
        environment_id: env.id,
        nango_config_id: integration.id!,
        sync_name: syncName,
        models
    });

    for (const variant of variants) {
        const created = await createSync({ connectionId: connection.id, syncConfig, variant });
        if (!created) {
            throw new Error(`failed to seed variant ${variant}`);
        }
    }

    return { integration, connection, syncConfig, sync };
}

describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
        await records.migrate();
    });

    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, {
            method: 'GET',
            params: { connectionId: 'test-connection' },
            query: { env: 'dev', provider_config_key: 'github' }
        });

        shouldBeProtected(res);
    });

    it('should require the env query param', async () => {
        const { apiKey } = await seedAccountEnvAndUser();

        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            params: { connectionId: 'test-connection' },
            query: { provider_config_key: 'github' } as any
        });

        shouldRequireQueryEnv(res);
    });

    it('should reject unknown query params', async () => {
        const { env, apiKey } = await seedAccountEnvAndUser();
        const { connection } = await seedConnectionWithSyncs({ env });

        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            params: { connectionId: connection.connection_id },
            query: { env: env.name, provider_config_key: 'github', connection_id: connection.connection_id } as any
        });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json.error.code).toBe('invalid_query_params');
    });

    it('should reject a limit above the maximum and a negative page', async () => {
        const { env, apiKey } = await seedAccountEnvAndUser();
        const { connection } = await seedConnectionWithSyncs({ env });

        const tooBig = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            params: { connectionId: connection.connection_id },
            query: { env: env.name, provider_config_key: 'github', limit: 101 }
        });
        isError(tooBig.json);
        expect(tooBig.res.status).toBe(400);

        const negativePage = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            params: { connectionId: connection.connection_id },
            query: { env: env.name, provider_config_key: 'github', page: -1 }
        });
        isError(negativePage.json);
        expect(negativePage.res.status).toBe(400);
    });

    it('should 404 for an unknown connection', async () => {
        const { env, apiKey } = await seedAccountEnvAndUser();
        await createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            params: { connectionId: 'does-not-exist' },
            query: { env: env.name, provider_config_key: 'github' }
        });

        isError(res.json);
        expect(res.res.status).toBe(404);
    });

    it('should return an empty page with a zero total for a connection with no syncs', async () => {
        const { env, apiKey } = await seedAccountEnvAndUser();
        await createConfigSeed(env, 'github', 'github');
        const connection = await createConnectionSeed({ env, provider: 'github' });

        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            params: { connectionId: connection.connection_id },
            query: { env: env.name, provider_config_key: 'github' }
        });

        isSuccess(res.json);
        expect(res.json.data).toEqual([]);
        expect(res.json.pagination).toStrictEqual({ total: 0, page: 0, limit: 20 });
    });

    it('should paginate, keeping the total correct on an out-of-range page', async () => {
        const { env, apiKey } = await seedAccountEnvAndUser();
        const { connection } = await seedConnectionWithSyncs({ env, variants: ['v1', 'v2', 'v3', 'v4'] });

        const fetchPage = async (page: number) => {
            const res = await api.fetch(route, {
                method: 'GET',
                token: apiKey.secret,
                params: { connectionId: connection.connection_id },
                query: { env: env.name, provider_config_key: 'github', page, limit: 2 }
            });
            isSuccess(res.json);
            return res.json;
        };

        const first = await fetchPage(0);
        expect(first.data).toHaveLength(2);
        expect(first.pagination.total).toBe(5);

        const last = await fetchPage(2);
        expect(last.data).toHaveLength(1);

        const beyond = await fetchPage(9);
        expect(beyond.data).toHaveLength(0);
        expect(beyond.pagination.total).toBe(5);
    });

    it('should order by name then variant, with no gaps or duplicates across pages', async () => {
        const { env, apiKey } = await seedAccountEnvAndUser();
        const { connection } = await seedConnectionWithSyncs({ env, variants: ['delta', 'alpha', 'charlie', 'bravo'] });

        const seen: { name: string; variant: string }[] = [];
        for (const page of [0, 1, 2]) {
            const res = await api.fetch(route, {
                method: 'GET',
                token: apiKey.secret,
                params: { connectionId: connection.connection_id },
                query: { env: env.name, provider_config_key: 'github', page, limit: 2 }
            });
            isSuccess(res.json);
            seen.push(...res.json.data.map((sync) => ({ name: sync.name, variant: sync.variant })));
        }

        expect(seen).toStrictEqual([
            { name: 'emails', variant: 'alpha' },
            { name: 'emails', variant: 'base' },
            { name: 'emails', variant: 'bravo' },
            { name: 'emails', variant: 'charlie' },
            { name: 'emails', variant: 'delta' }
        ]);
    });

    it('should look up one sync by exact name and variant', async () => {
        const { env, apiKey } = await seedAccountEnvAndUser();
        const { connection } = await seedConnectionWithSyncs({ env, variants: ['other'] });

        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            params: { connectionId: connection.connection_id },
            query: { env: env.name, provider_config_key: 'github', name: 'emails', variant: 'base', limit: 1 }
        });

        isSuccess(res.json);
        expect(res.json.data).toHaveLength(1);
        expect(res.json.data[0]!.variant).toBe('base');
        expect(res.json.pagination.total).toBe(1);
    });

    it('should return null latest_sync for a sync that never ran', async () => {
        const { env, apiKey } = await seedAccountEnvAndUser();
        const { connection } = await seedConnectionWithSyncs({ env });

        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            params: { connectionId: connection.connection_id },
            query: { env: env.name, provider_config_key: 'github' }
        });

        isSuccess(res.json);
        expect(res.json.data[0]!.latest_sync).toBeNull();
    });

    it('should return only the newest job in latest_sync, with ISO timestamps', async () => {
        const { env, apiKey } = await seedAccountEnvAndUser();
        const { connection, sync, syncConfig } = await seedConnectionWithSyncs({ env });

        await createSyncJobSeeds(sync.id, { sync_config_id: syncConfig.id });
        const newest = await createSyncJobSeeds(sync.id, { sync_config_id: syncConfig.id });

        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            params: { connectionId: connection.connection_id },
            query: { env: env.name, provider_config_key: 'github' }
        });

        isSuccess(res.json);
        const latest = res.json.data[0]!.latest_sync;
        expect(latest?.job_id).toBe(String(newest.id));
        expect(latest?.created_at).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
    });

    it('should key record_count by bare model name', async () => {
        const { env, apiKey } = await seedAccountEnvAndUser();
        const { connection } = await seedConnectionWithSyncs({ env, variants: ['other'], models: ['Email'] });

        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            params: { connectionId: connection.connection_id },
            query: { env: env.name, provider_config_key: 'github' }
        });

        isSuccess(res.json);
        for (const sync of res.json.data) {
            expect(Object.keys(sync.record_count ?? {})).toStrictEqual(['Email']);
        }
    });

    it('should exclude soft-deleted syncs and non-sync configs', async () => {
        const { env, apiKey } = await seedAccountEnvAndUser();
        const integration = await createConfigSeed(env, 'github', 'github');
        const connection = await createConnectionSeed({ env, provider: 'github' });

        await createSyncSeeds({
            connectionId: connection.id,
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'a-real-sync',
            models: ['Email']
        });
        await createSyncSeeds({
            connectionId: connection.id,
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'an-action',
            type: 'action',
            models: ['Email']
        });
        const { sync: removed } = await createSyncSeeds({
            connectionId: connection.id,
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'a-removed-sync',
            models: ['Email']
        });
        await db.knex.from('_nango_syncs').where({ id: removed.id }).update({ deleted: true, deleted_at: new Date() });

        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            params: { connectionId: connection.connection_id },
            query: { env: env.name, provider_config_key: 'github' }
        });

        isSuccess(res.json);
        expect(res.json.data.map((s) => s.name)).toStrictEqual(['a-real-sync']);
    });

    it('should still return the page when the orchestrator is unreachable', async () => {
        const { env, apiKey } = await seedAccountEnvAndUser();
        const { connection } = await seedConnectionWithSyncs({ env });

        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            params: { connectionId: connection.connection_id },
            query: { env: env.name, provider_config_key: 'github' }
        });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json.data[0]!.schedule_status).toBeNull();
        expect(res.json.data[0]!.futureActionTimes).toStrictEqual([]);
    });
});
