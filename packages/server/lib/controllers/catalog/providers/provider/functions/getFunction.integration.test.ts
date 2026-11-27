import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { catalogStore } from '@nangohq/shared';

import providerService, { isCatalogToolTemplate } from '../../../../../services/provider.service.js';
import { isError, isSuccess, runServer } from '../../../../../utils/tests.js';

const route = '/catalog/providers/:provider/functions/:name';
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

    it('returns an action with its models, matching the list item', async () => {
        const list = await api.fetch('/catalog/providers/:provider/functions', {
            method: 'GET',
            params: { provider: 'google-calendar' },
            query: { search: 'add-attendee' }
        });
        const res = await api.fetch(route, { method: 'GET', params: { provider: 'google-calendar', name: 'add-attendee' }, query: {} });

        isSuccess(list.json);
        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json.data).toStrictEqual({
            ...list.json.data.find(({ name }) => name === 'add-attendee'),
            input: expect.any(String),
            returns: expect.any(Array),
            json_schema: expect.any(Object)
        });
    });

    it('returns a sync with its models and schedule, matching the list item', async () => {
        const list = await api.fetch('/catalog/providers/:provider/functions', {
            method: 'GET',
            params: { provider: 'google-calendar' },
            query: { type: 'sync', search: 'calendar-events' }
        });
        const res = await api.fetch(route, { method: 'GET', params: { provider: 'google-calendar', name: 'calendar-events' }, query: { type: 'sync' } });

        isSuccess(list.json);
        isSuccess(res.json);
        expect(res.json.data).toStrictEqual({
            ...list.json.data.find(({ name }) => name === 'calendar-events'),
            input: expect.any(String),
            returns: expect.any(Array),
            json_schema: expect.any(Object),
            runs: expect.any(String),
            auto_start: expect.any(Boolean),
            track_deletes: expect.any(Boolean)
        });
    });

    it('returns a tool with its resolved input and output schemas', async () => {
        const provider = findProviderWithCatalogTool();
        const list = await api.fetch('/catalog/providers/:provider/functions', { method: 'GET', params: { provider }, query: { type: 'tool', limit: 100 } });
        isSuccess(list.json);
        const tool = list.json.data.find(({ type }) => type === 'tool');
        if (!tool) {
            throw new Error(`Expected a ${provider} catalog tool`);
        }

        const res = await api.fetch(route, { method: 'GET', params: { provider, name: tool.name }, query: {} });

        isSuccess(res.json);
        expect(res.json.data).toStrictEqual({
            ...tool,
            input_json_schema: expect.objectContaining({ $ref: expect.any(String), definitions: expect.any(Object) }),
            output_json_schema: expect.objectContaining({ $ref: expect.any(String), definitions: expect.any(Object) })
        });
    });

    it.each([
        ['provider', { provider: 'not-a-provider', name: 'add-attendee' }],
        ['function', { provider: 'google-calendar', name: 'not-a-function' }]
    ])('returns 404 for an unknown %s', async (_label, params) => {
        const res = await api.fetch(route, { method: 'GET', params, query: {} });

        isError(res.json);
        expect(res.res.status).toBe(404);
        expect(res.json.error.code).toBe('not_found');
    });

    it('returns 404 when the type filter excludes the function', async () => {
        const res = await api.fetch(route, { method: 'GET', params: { provider: 'google-calendar', name: 'add-attendee' }, query: { type: 'sync' } });

        isError(res.json);
        expect(res.res.status).toBe(404);
    });

    it('rejects unknown query params', async () => {
        const res = await api.fetch(route, { method: 'GET', params: { provider: 'google-calendar', name: 'add-attendee' }, query: { foo: 'bar' } as never });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json.error.code).toBe('invalid_query_params');
    });
});
