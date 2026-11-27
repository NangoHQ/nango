import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { isError, isSuccess, runServer } from '../../../utils/tests.js';

const route = '/catalog/providers/:provider';
let api: Awaited<ReturnType<typeof runServer>>;

describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('returns the same object as the list, without authentication', async () => {
        const list = await api.fetch('/catalog/providers', { method: 'GET', query: { search: 'posthog', limit: 1 } });
        const res = await api.fetch(route, { method: 'GET', params: { provider: 'posthog' } });

        isSuccess(list.json);
        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json.data).toStrictEqual(list.json.data[0]);
        expect(res.json.data).toMatchObject({
            name: 'posthog',
            auth_mode: 'API_KEY',
            docs_connect: 'https://nango.dev/docs/api-integrations/posthog/connect',
            setup_guide_url: null,
            setup: { type: 'none' }
        });
    });

    it.each(['not-a-provider', 'constructor', '__proto__'])('returns 404 for the unknown provider %s', async (provider) => {
        const res = await api.fetch(route, { method: 'GET', params: { provider } });

        isError(res.json);
        expect(res.res.status).toBe(404);
        expect(res.json.error.code).toBe('not_found');
    });

    it('rejects query params', async () => {
        const res = await api.fetch(route, { method: 'GET', params: { provider: 'posthog' }, query: { foo: 'bar' } as never });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json.error.code).toBe('invalid_query_params');
    });
});
