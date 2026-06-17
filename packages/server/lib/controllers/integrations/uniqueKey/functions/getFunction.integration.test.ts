import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../../../utils/tests.js';

const route = '/integrations/:uniqueKey/functions/:name';
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
        const res = await api.fetch(route, { method: 'GET', params: { uniqueKey: 'github', name: 'my-sync' }, query: {} });

        shouldBeProtected(res);
    });

    it('should reject a key lacking the read scope', async () => {
        const seed = await seedWithScopes(['environment:integrations:functions:list']);

        const res = await api.fetch(route, { method: 'GET', token: seed.apiKey.secret, params: { uniqueKey: 'github', name: 'my-sync' }, query: {} });

        isError(res.json);
        expect(res.res.status).toBe(403);
        expect(res.json.error.code).toBe('forbidden');
    });

    it('should 404 when the function does not exist', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { uniqueKey: 'github', name: 'does-not-exist' }, query: {} });

        isError(res.json);
        expect(res.res.status).toBe(404);
        expect(res.json.error.code).toBe('not_found');
    });

    it('should return a function for the environment derived from the key', async () => {
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

        const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { uniqueKey: 'github', name: 'my-sync' }, query: {} });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.data.name).toBe('my-sync');
        expect(res.json.data.type).toBe('sync');
    });
});
