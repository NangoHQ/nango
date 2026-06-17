import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../../../utils/tests.js';

const route = '/integrations/:uniqueKey/functions';
let api: Awaited<ReturnType<typeof runServer>>;

async function seedWithScopes(scopes: string[]) {
    const seed = await seeders.seedAccountEnvAndUser();
    await db.knex('customer_keys').where('id', seed.apiKey.id).update({ scopes });
    return seed;
}

describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, { method: 'GET', params: { uniqueKey: 'github' }, query: {} });

        shouldBeProtected(res);
    });

    it('should reject a key lacking the list scope', async () => {
        const seed = await seedWithScopes(['environment:integrations:functions:read']);

        const res = await api.fetch(route, { method: 'GET', token: seed.apiKey.secret, params: { uniqueKey: 'github' }, query: {} });

        isError(res.json);
        expect(res.res.status).toBe(403);
        expect(res.json.error.code).toBe('forbidden');
    });

    it('should reject an env query param (env comes from the key)', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            params: { uniqueKey: 'github' },
            // @ts-expect-error env is not accepted on the public endpoint
            query: { env: 'dev' }
        });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json.error.code).toBe('invalid_query_params');
    });

    it('should 404 when the integration does not exist', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { uniqueKey: 'missing' }, query: {} });

        isError(res.json);
        expect(res.res.status).toBe(404);
        expect(res.json.error.code).toBe('not_found');
    });

    it('should list functions for the environment derived from the key', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const integration = await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, provider: 'github' });

        await seeders.createSyncSeeds({
            connectionId: connection.id,
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'my-sync',
            type: 'sync'
        });
        await seeders.createSyncSeeds({
            connectionId: connection.id,
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'my-action',
            type: 'action'
        });

        const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { uniqueKey: 'github' }, query: {} });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.pagination).toStrictEqual({ total: 2, page: 0, limit: 20 });
        expect(res.json.data.map((f) => ({ name: f.name, type: f.type }))).toStrictEqual([
            { name: 'my-action', type: 'action' },
            { name: 'my-sync', type: 'sync' }
        ]);
    });

    it('should filter by type and search', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const integration = await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, provider: 'github' });

        await seeders.createSyncSeeds({
            connectionId: connection.id,
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'fetch-issues',
            type: 'sync'
        });
        await seeders.createSyncSeeds({
            connectionId: connection.id,
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'fetch-users',
            type: 'sync'
        });

        const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { uniqueKey: 'github' }, query: { type: 'sync', search: 'issue' } });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.pagination.total).toBe(1);
        expect(res.json.data[0]?.name).toBe('fetch-issues');
    });
});
