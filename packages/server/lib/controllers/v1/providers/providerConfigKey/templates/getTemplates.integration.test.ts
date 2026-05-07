import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import { isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../../../utils/tests.js';

const route = '/api/v1/providers/:providerConfigKey/templates';
let api: Awaited<ReturnType<typeof runServer>>;
describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, { method: 'GET', query: { env: 'dev' }, params: { providerConfigKey: 'github' } });

        shouldBeProtected(res);
    });

    it('should enforce env query params', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(
            route,
            // @ts-expect-error missing query on purpose
            { method: 'GET', token: apiKey.secret, params: { providerConfigKey: 'github' } }
        );

        shouldRequireQueryEnv(res);
    });

    it('should return template functions for a known provider', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            params: { providerConfigKey: 'github' },
            token: apiKey.secret
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.data.length).toBeGreaterThan(0);

        const writeFile = res.json.data.find((value) => value.name === 'write-file');
        expect(writeFile).toMatchObject({
            name: 'write-file',
            type: 'action'
        });
        expect(writeFile).not.toHaveProperty('runs');
        expect(writeFile).not.toHaveProperty('auto_start');
        expect(writeFile).not.toHaveProperty('track_deletes');
        expect(writeFile).not.toHaveProperty('source');
        expect(writeFile).not.toHaveProperty('id');

        const issues = res.json.data.find((value) => value.name === 'issues');
        expect(issues).toMatchObject({
            name: 'issues',
            type: 'sync'
        });
        if (issues?.type !== 'sync') throw new Error('expected issues to be a sync');
        expect(issues.runs).toBeDefined();
        expect(issues.auto_start).toBeDefined();
        expect(issues.track_deletes).toBeDefined();
    });

    it('should return an empty array for a provider with no templates', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            params: { providerConfigKey: 'definitely-not-a-real-provider' },
            token: apiKey.secret
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.data).toStrictEqual([]);
    });
});
