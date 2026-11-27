import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import providerService from '../../../services/provider.service.js';
import { isError, isSuccess, runServer } from '../../../utils/tests.js';

const route = '/catalog/providers';
let api: Awaited<ReturnType<typeof runServer>>;

describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('lists providers without authentication, sorted by slug', async () => {
        const res = await api.fetch(route, { method: 'GET', query: {} });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json.data).toHaveLength(20);
        expect(res.json.pagination).toStrictEqual({ total: expect.any(Number), page: 0, limit: 20 });
        expect(res.json.pagination.total).toBeGreaterThan(1000);
        const names = res.json.data.map(({ name }) => name);
        expect(names).toStrictEqual([...names].sort((a, b) => a.localeCompare(b)));
    });

    it('finds a provider by its display name', async () => {
        const res = await api.fetch(route, { method: 'GET', query: { search: 'addepar oauth' } });

        isSuccess(res.json);
        expect(res.json.data[0]?.name).toBe('addepar');
    });

    it('returns the catalog fields for each provider', async () => {
        const res = await api.fetch(route, { method: 'GET', query: { search: 'google-calendar', limit: 1 } });

        isSuccess(res.json);
        const counts = providerService.countTemplatesByProvider();
        if (counts.isErr()) {
            throw counts.error;
        }
        const googleCalendarCounts = counts.value.get('google-calendar');
        expect(res.json.data[0]).toStrictEqual({
            name: 'google-calendar',
            display_name: 'Google Calendar',
            categories: ['productivity'],
            auth_mode: 'OAUTH2',
            logo_url: expect.stringMatching(/\/images\/template-logos\/google-calendar\.svg$/),
            docs: 'https://nango.dev/docs/api-integrations/google-calendar',
            docs_connect: null,
            setup_guide_url: expect.any(String),
            default_scopes: [],
            setup: expect.toBeOneOf([{ type: 'nango-managed-app', scopes: expect.any(Array) }, { type: 'required' }]),
            function_counts: { tool: googleCalendarCounts?.tools ?? 0, sync: googleCalendarCounts?.syncs ?? 0 }
        });
    });

    it('reports a Nango-managed app with its scopes when shared credentials exist, and required setup otherwise', async () => {
        const before = await api.fetch(route, { method: 'GET', query: { search: 'asana', limit: 1 } });
        isSuccess(before.json);
        expect(before.json.data[0]).toMatchObject({ name: 'asana', setup: { type: 'required' } });

        const sharedCredentials = await seeders.createSharedCredentialsSeed('asana');
        try {
            const after = await api.fetch(route, { method: 'GET', query: { search: 'asana', limit: 1 } });
            isSuccess(after.json);
            expect(after.json.data[0]).toStrictEqual(expect.objectContaining({ name: 'asana', setup: { type: 'nango-managed-app', scopes: ['test'] } }));
        } finally {
            await db.knex('providers_shared_credentials').where({ id: sharedCredentials.id }).delete();
        }
    });

    it('reports no setup for an API key provider', async () => {
        const res = await api.fetch(route, { method: 'GET', query: { search: 'posthog', limit: 1 } });

        isSuccess(res.json);
        expect(res.json.data[0]).toMatchObject({ name: 'posthog', setup: { type: 'none' } });
    });

    it('paginates', async () => {
        const firstFour = await api.fetch(route, { method: 'GET', query: { limit: 4, page: 0 } });
        const first = await api.fetch(route, { method: 'GET', query: { limit: 2, page: 0 } });
        const second = await api.fetch(route, { method: 'GET', query: { limit: 2, page: 1 } });

        isSuccess(firstFour.json);
        isSuccess(first.json);
        isSuccess(second.json);
        expect([...first.json.data, ...second.json.data].map(({ name }) => name)).toStrictEqual(firstFour.json.data.map(({ name }) => name));
        expect(second.json.pagination).toStrictEqual({ total: firstFour.json.pagination.total, page: 1, limit: 2 });
    });

    it('returns an empty page when nothing matches', async () => {
        const res = await api.fetch(route, { method: 'GET', query: { search: 'zzzznotaprovider' } });

        isSuccess(res.json);
        expect(res.json).toStrictEqual({ data: [], pagination: { total: 0, page: 0, limit: 20 } });
    });

    it.each([
        ['a search without letters or digits', { search: '---' }],
        ['a limit above 100', { limit: 101 }],
        ['an unknown query param', { foo: 'bar' } as Record<string, string>]
    ])('rejects %s', async (_label, query) => {
        const res = await api.fetch(route, { method: 'GET', query });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json.error.code).toBe('invalid_query_params');
    });

    it('returns a JSON 404 for unknown catalog paths', async () => {
        const res = await fetch(`${api.url}/catalog/unknown`);

        expect(res.status).toBe(404);
        expect(await res.json()).toStrictEqual({ error: { code: 'not_found', message: 'Not found' } });
    });
});
