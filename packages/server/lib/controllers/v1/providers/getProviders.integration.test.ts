import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import { isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../utils/tests.js';

const route = '/api/v1/providers';
let api: Awaited<ReturnType<typeof runServer>>;
describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, { method: 'GET', query: { env: 'dev' } });

        shouldBeProtected(res);
    });

    it('should enforce env query params', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        // @ts-expect-error missing query on purpose
        const res = await api.fetch(route, { method: 'GET', token: apiKey.secret });

        shouldRequireQueryEnv(res);
    });

    it('should count template functions per provider, matching the templates endpoint', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, { method: 'GET', query: { env: 'dev' }, token: apiKey.secret });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);

        const templates = await api.fetch('/api/v1/providers/:providerConfigKey/templates', {
            method: 'GET',
            query: { env: 'dev' },
            params: { providerConfigKey: 'github' },
            token: apiKey.secret
        });
        isSuccess(templates.json);
        const expectedActions = templates.json.data.filter((fn) => fn.type === 'action').length;
        const expectedSyncs = templates.json.data.filter((fn) => fn.type === 'sync').length;
        expect(expectedActions).toBeGreaterThan(0);
        expect(expectedSyncs).toBeGreaterThan(0);

        const github = res.json.data.find((provider) => provider.name === 'github');
        expect(github?.functionCounts).toStrictEqual({ actions: expectedActions, syncs: expectedSyncs });
    });

    it('should return zero counts for a provider with no templates', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, { method: 'GET', query: { env: 'dev' }, token: apiKey.secret });

        isSuccess(res.json);
        const provider = res.json.data.find((item) => item.name === '3cx');
        expect(provider?.functionCounts).toStrictEqual({ actions: 0, syncs: 0 });
    });
});
