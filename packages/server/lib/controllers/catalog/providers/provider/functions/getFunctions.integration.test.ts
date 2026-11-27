import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { catalogStore } from '@nangohq/shared';

import providerService, { isCatalogToolTemplate } from '../../../../../services/provider.service.js';
import { isError, isSuccess, runServer } from '../../../../../utils/tests.js';

const route = '/catalog/providers/:provider/functions';
let api: Awaited<ReturnType<typeof runServer>>;

function findProviderWithCatalogTool(): string {
    const provider = catalogStore.listProviders().find((name) => providerService.listTemplates({ providerName: name }).unwrap().some(isCatalogToolTemplate));
    if (!provider) {
        throw new Error('Expected a provider with catalog tools');
    }
    return provider;
}

describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('lists functions without authentication, sorted by name', async () => {
        const res = await api.fetch(route, { method: 'GET', params: { provider: 'google-calendar' }, query: { limit: 100 } });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json.data.length).toBeGreaterThan(0);
        const names = res.json.data.map(({ name }) => name);
        expect(names).toStrictEqual([...names].sort((a, b) => a.localeCompare(b)));
        expect(res.json.data.find(({ name }) => name === 'add-attendee')).toStrictEqual({
            name: 'add-attendee',
            type: 'action',
            description: expect.any(String),
            meta: { tags: {}, required_scopes: { all: expect.arrayContaining([expect.any(String)]) } }
        });
    });

    it('matches the provider function counts for each type filter', async () => {
        const provider = await api.fetch('/catalog/providers/:provider', { method: 'GET', params: { provider: 'google-calendar' } });
        const tools = await api.fetch(route, { method: 'GET', params: { provider: 'google-calendar' }, query: { type: 'tool', limit: 100 } });
        const syncs = await api.fetch(route, { method: 'GET', params: { provider: 'google-calendar' }, query: { type: 'sync', limit: 100 } });

        isSuccess(provider.json);
        isSuccess(tools.json);
        isSuccess(syncs.json);
        expect(tools.json.pagination.total).toBe(provider.json.data.function_counts.tool);
        expect(syncs.json.pagination.total).toBe(provider.json.data.function_counts.sync);
        expect(tools.json.data.every(({ type }) => type === 'action' || type === 'tool')).toBe(true);
        expect(syncs.json.data.every(({ type }) => type === 'sync')).toBe(true);
    });

    it('returns catalog tools for type=tool, matching the provider tool count', async () => {
        const provider = findProviderWithCatalogTool();
        const catalogProvider = await api.fetch('/catalog/providers/:provider', { method: 'GET', params: { provider } });
        const res = await api.fetch(route, { method: 'GET', params: { provider }, query: { type: 'tool', limit: 100 } });

        isSuccess(catalogProvider.json);
        isSuccess(res.json);
        expect(res.json.pagination.total).toBe(catalogProvider.json.data.function_counts.tool);
        expect(res.json.data.find(({ type }) => type === 'tool')).toMatchObject({ description: expect.any(String) });
    });

    it('searches function names', async () => {
        const res = await api.fetch(route, { method: 'GET', params: { provider: 'google-calendar' }, query: { search: 'add attendee' } });

        isSuccess(res.json);
        expect(res.json.data.map(({ name }) => name)).toContain('add-attendee');
    });

    it('paginates', async () => {
        const firstFour = await api.fetch(route, { method: 'GET', params: { provider: 'google-calendar' }, query: { limit: 4, page: 0 } });
        const first = await api.fetch(route, { method: 'GET', params: { provider: 'google-calendar' }, query: { limit: 2, page: 0 } });
        const second = await api.fetch(route, { method: 'GET', params: { provider: 'google-calendar' }, query: { limit: 2, page: 1 } });

        isSuccess(firstFour.json);
        isSuccess(first.json);
        isSuccess(second.json);
        expect([...first.json.data, ...second.json.data]).toStrictEqual(firstFour.json.data);
        expect(second.json.pagination).toStrictEqual({ total: firstFour.json.pagination.total, page: 1, limit: 2 });
    });

    it('returns an empty list for a provider without catalog functions', async () => {
        const res = await api.fetch(route, { method: 'GET', params: { provider: 'addepar' }, query: {} });

        isSuccess(res.json);
        expect(res.json).toStrictEqual({ data: [], pagination: { total: 0, page: 0, limit: 20 } });
    });

    it.each(['not-a-provider', 'constructor'])('returns 404 for the unknown provider %s', async (provider) => {
        const res = await api.fetch(route, { method: 'GET', params: { provider }, query: {} });

        isError(res.json);
        expect(res.res.status).toBe(404);
        expect(res.json.error.code).toBe('not_found');
    });

    it.each([
        ['the action type', { type: 'action' } as Record<string, string>],
        ['a search without letters or digits', { search: '---' }],
        ['an unknown query param', { foo: 'bar' } as Record<string, string>]
    ])('rejects %s', async (_label, query) => {
        const res = await api.fetch(route, { method: 'GET', params: { provider: 'google-calendar' }, query });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json.error.code).toBe('invalid_query_params');
    });
});
