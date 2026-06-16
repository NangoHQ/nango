import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../../../utils/tests.js';

const route = '/providers/:provider/templates';
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
        const res = await api.fetch(route, { method: 'GET', params: { provider: 'github' } });

        shouldBeProtected(res);
    });

    it('should reject a key lacking the list scope', async () => {
        const seed = await seedWithScopes(['environment:connections:read']);

        const res = await api.fetch(route, { method: 'GET', token: seed.apiKey.secret, params: { provider: 'github' } });

        isError(res.json);
        expect(res.res.status).toBe(403);
        expect(res.json.error.code).toBe('forbidden');
    });

    it('should return template functions for a known provider', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { provider: 'github' } });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.data.length).toBeGreaterThan(0);

        const issues = res.json.data.find((value) => value.name === 'issues');
        expect(issues).toMatchObject({ name: 'issues', type: 'sync' });
        // The public catalog listing carries no deployment metadata.
        expect(issues).not.toHaveProperty('source');
        expect(issues).not.toHaveProperty('id');
    });

    it('should return an empty array for a provider with no templates', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { provider: 'definitely-not-a-real-provider' } });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.data).toStrictEqual([]);
    });
});
