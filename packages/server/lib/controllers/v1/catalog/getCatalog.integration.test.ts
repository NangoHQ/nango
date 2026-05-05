import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../utils/tests.js';

const route = '/api/v1/catalog';
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
        const res = await api.fetch(
            route,
            // @ts-expect-error missing query on purpose
            { method: 'GET', token: apiKey.secret }
        );

        shouldRequireQueryEnv(res);
    });

    it('should reject invalid query params', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'GET',
            // @ts-expect-error unknown param on purpose
            query: { env: 'dev', foo: 'bar' },
            token: apiKey.secret
        });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json.error.code).toBe('invalid_query_params');
    });

    it('should return all catalog functions grouped by provider when no provider filter is set', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            token: apiKey.secret
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.data.length).toBeGreaterThan(0);
        for (const group of res.json.data) {
            expect(typeof group.providerConfigKey).toBe('string');
            for (const fn of group.functions) {
                expect(fn.source).toBe('catalog');
            }
        }
    });

    it('should filter to a single provider when provider query is set', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev', provider: 'github' },
            token: apiKey.secret
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.data).toHaveLength(1);
        expect(res.json.data[0]?.providerConfigKey).toBe('github');

        const writeFile = res.json.data[0]?.functions.find((value) => value.name === 'write-file');
        expect(writeFile).toMatchObject({
            source: 'catalog',
            name: 'write-file',
            type: 'action'
        });
    });

    it('should return an empty array for an unknown provider', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev', provider: 'definitely-not-a-real-provider' },
            token: apiKey.secret
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.data).toStrictEqual([]);
    });
});
