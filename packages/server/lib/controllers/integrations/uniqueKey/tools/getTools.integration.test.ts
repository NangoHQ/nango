import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import { getFlags } from '@nangohq/feature-flags';
import { functionConfigService, listCatalogTools, seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../../../utils/tests.js';

import type { DBFunctionConfigVersion, DBSyncConfig } from '@nangohq/types';

const route = '/integrations/:uniqueKey/tools';
let api: Awaited<ReturnType<typeof runServer>>;
const params = { uniqueKey: 'github-123' };

const version = {
    description: 'HTTP function',
    tags: { instructions: 'Use with care', required_scopes: ['repo'], category: 'test' },
    file_location: 'github/functions/fetchIssue.js',
    version: 'test-version',
    source: 'repo',
    trigger: { kind: 'http' },
    requires: { connection: true, outbound: false, invoke: false },
    capabilities: { usesRecords: false, usesOutbound: false, usesCheckpoints: false, usesMetadata: false, usesInvoke: false },
    limits: { concurrency: { perConnection: 'max' } },
    input_schema_ref: '#/definitions/Input',
    output_schema_ref: '#/definitions/Output',
    model_schema_refs: [],
    metadata_schema_ref: null,
    checkpoint_schema_ref: null,
    json_schema: { definitions: { Input: { type: 'string' }, Output: { type: 'number' } } }
} satisfies Omit<DBFunctionConfigVersion, 'id' | 'function_config_id' | 'created_at' | 'updated_at' | 'deleted_at'>;

async function seed() {
    const seed = await seeders.seedAccountEnvAndUser();
    const integration = await seeders.createConfigSeed(seed.env, params.uniqueKey, 'github');
    return { ...seed, integration };
}

async function seedAction(environmentId: number, integrationId: number, name: string, overrides: Partial<DBSyncConfig> = {}) {
    await db.knex.from<DBSyncConfig>('_nango_sync_configs').insert({
        environment_id: environmentId,
        nango_config_id: integrationId,
        sync_name: name,
        type: 'action',
        file_location: 'file_location',
        version: '0.0.1',
        source: 'repo',
        runs: null,
        track_deletes: false,
        auto_start: false,
        webhook_subscriptions: [],
        models: ['Output'],
        input: 'Input',
        models_json_schema: version.json_schema,
        metadata: { description: 'Legacy action', scopes: ['repo'] },
        active: true,
        enabled: true,
        deleted: false,
        deleted_at: null,
        ...overrides
    });
}

describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
        vi.spyOn(getFlags(), 'hasCatalogTools').mockResolvedValue(false);
    });
    beforeEach(() => {
        vi.mocked(getFlags().hasCatalogTools).mockResolvedValue(false);
    });
    afterAll(() => {
        vi.restoreAllMocks();
        api.server.close();
    });

    it('requires authentication and the list scope', async () => {
        shouldBeProtected(await api.fetch(route, { method: 'GET', query: {}, params }));
        const { apiKey } = await seed();
        await db
            .knex('customer_keys')
            .where({ id: apiKey.id })
            .update({ scopes: ['environment:functions:read'] });
        expect((await api.fetch(route, { method: 'GET', query: {}, token: apiKey.secret, params })).res.status).toBe(403);
    });

    it('validates integration keys and rejects unknown query parameters', async () => {
        const { apiKey } = await seed();
        const invalid = await api.fetch(route, { method: 'GET', query: {}, token: apiKey.secret, params: { uniqueKey: 'invalid!' } });
        expect(invalid.res.status).toBe(400);
        isError(invalid.json);
        expect(invalid.json.error.code).toBe('invalid_uri_params');
        const query = await api.fetch(route, { method: 'GET', token: apiKey.secret, params, query: { extra: 'x' } as never });
        expect(query.res.status).toBe(400);
        isError(query.json);
        expect(query.json.error.code).toBe('invalid_query_params');
    });

    it('returns an empty list for an integration without tools', async () => {
        const { apiKey } = await seed();
        const empty = await api.fetch(route, { method: 'GET', query: {}, token: apiKey.secret, params });
        expect(empty.res.status).toBe(200);
        expect(empty.json).toStrictEqual({ data: [], next_cursor: null });
    });

    it('returns 404 for an unknown integration', async () => {
        const { apiKey } = await seed();
        const missing = await api.fetch(route, { method: 'GET', query: {}, token: apiKey.secret, params: { uniqueKey: 'unknown' } });
        expect(missing.res.status).toBe(404);
    });

    it('rejects invalid cursors and page sizes', async () => {
        const { apiKey } = await seed();
        for (const query of [
            { cursor: '' },
            { cursor: 'invalid' },
            { cursor: Buffer.from([0xff]).toString('base64url') },
            { cursor: 'a'.repeat(1025) },
            { cursor: `${Buffer.from('1').toString('base64url')}!` },
            { limit: 0 },
            { limit: -1 },
            { limit: 251 },
            { limit: 1.5 }
        ]) {
            const response = await api.fetch(route, { method: 'GET', token: apiKey.secret, params, query });
            expect(response.res.status).toBe(400);
            isError(response.json);
            expect(response.json.error.code).toBe('invalid_query_params');
        }
    });

    it('paginates tools', async () => {
        const { env, apiKey, integration } = await seed();
        for (const name of ['bravo', 'charlie', 'delta']) {
            await seedAction(env.id, integration.id!, name);
        }
        (
            await functionConfigService.upsert(
                db.knex,
                ['alpha', 'charlie'].map((name) => ({ environmentId: env.id, integrationId: params.uniqueKey, name, version }))
            )
        ).unwrap();

        const first = await api.fetch(route, { method: 'GET', token: apiKey.secret, params, query: { limit: 2 } });
        expect(first.res.status).toBe(200);
        isSuccess(first.json);
        expect(first.json.data.map((tool) => tool.name)).toEqual(['alpha', 'bravo']);
        expect(first.json.next_cursor).toEqual(expect.any(String));

        await seedAction(env.id, integration.id!, 'aardvark');
        const second = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            params,
            query: { cursor: first.json.next_cursor!, limit: 1 }
        });
        expect(second.res.status).toBe(200);
        isSuccess(second.json);
        expect(second.json.data.map((tool) => tool.name)).toEqual(['charlie']);
        expect(second.json.data[0]).toMatchObject({ description: version.description, uuid: expect.any(String) });
        expect(second.json.next_cursor).toEqual(expect.any(String));

        await db.knex('_nango_sync_configs').where({ nango_config_id: integration.id!, sync_name: 'bravo' }).update({ enabled: false });
        await db.knex('function_configs').where({ environment_id: env.id, name: 'charlie' }).update({ enabled: false });
        const last = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            params,
            query: { cursor: second.json.next_cursor!, limit: 1 }
        });
        expect(last.res.status).toBe(200);
        isSuccess(last.json);
        expect(last.json.data.map((tool) => tool.name)).toEqual(['delta']);
        expect(last.json.next_cursor).toBeNull();
    });

    it('defaults to 250 tools per page', async () => {
        const { env, apiKey } = await seed();
        (
            await functionConfigService.upsert(
                db.knex,
                Array.from({ length: 251 }, (_, i) => ({
                    environmentId: env.id,
                    integrationId: params.uniqueKey,
                    name: `tool-${String(i).padStart(3, '0')}`,
                    version
                }))
            )
        ).unwrap();
        const first = await api.fetch(route, { method: 'GET', query: {}, token: apiKey.secret, params });
        expect(first.res.status).toBe(200);
        isSuccess(first.json);
        expect(first.json.data).toHaveLength(250);
        expect(first.json.next_cursor).toEqual(expect.any(String));
        const last = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            params,
            query: { cursor: first.json.next_cursor! }
        });
        expect(last.res.status).toBe(200);
        isSuccess(last.json);
        expect(last.json.data.map((tool) => tool.name)).toEqual(['tool-250']);
        expect(last.json.next_cursor).toBeNull();
    });

    it('lists available functions and actions once, preferring functions and excluding unavailable tools', async () => {
        const { env, apiKey, integration } = await seed();
        for (const name of ['duplicate', 'legacy', 'disabled', 'inactive', 'deleted', 'sync']) {
            await seedAction(env.id, integration.id!, name, {
                enabled: name !== 'disabled',
                active: name !== 'inactive',
                deleted: name === 'deleted',
                type: name === 'sync' ? 'sync' : 'action'
            });
        }
        const functions = (
            await functionConfigService.upsert(db.knex, [
                { environmentId: env.id, integrationId: params.uniqueKey, name: 'duplicate', version },
                { environmentId: env.id, integrationId: params.uniqueKey, name: 'function', version },
                { environmentId: env.id, integrationId: params.uniqueKey, name: 'disabledFunction', version },
                {
                    environmentId: env.id,
                    integrationId: params.uniqueKey,
                    name: 'scheduled',
                    version: { ...version, trigger: { kind: 'schedule', frequency: '0 * * * *' } }
                }
            ])
        ).unwrap();
        await db.knex('function_configs').where({ id: functions[2]!.config.id }).update({ enabled: false });

        const response = await api.fetch(route, { method: 'GET', query: {}, token: apiKey.secret, params });
        expect(response.res.status).toBe(200);
        const expected = [];
        for (const name of ['duplicate', 'function', 'legacy']) {
            const single = await api.fetch('/integrations/:uniqueKey/tools/:name', { method: 'GET', token: apiKey.secret, params: { ...params, name } });
            expect(single.res.status).toBe(200);
            expected.push(single.json);
        }
        expect(response.json).toStrictEqual({ data: expected, next_cursor: null });
        expect(expected[0]).toMatchObject({ uuid: functions[0]!.config.uuid, description: version.description });
    });

    it('hides an action shadowed by a disabled function with the same name', async () => {
        const { env, apiKey, integration } = await seed();
        await seedAction(env.id, integration.id!, 'shadowed');
        const [fn] = (
            await functionConfigService.upsert(db.knex, [{ environmentId: env.id, integrationId: params.uniqueKey, name: 'shadowed', version }])
        ).unwrap();
        await db.knex('function_configs').where({ id: fn!.config.id }).update({ enabled: false });

        const response = await api.fetch(route, { method: 'GET', query: {}, token: apiKey.secret, params });
        expect(response.res.status).toBe(200);
        expect(response.json).toStrictEqual({ data: [], next_cursor: null });
    });

    it('lists catalog tools only when the catalog flag is enabled', async () => {
        const { apiKey } = await seed();
        const catalog = listCatalogTools('github');
        expect(catalog.length).toBeGreaterThan(0);
        expect(catalog.length).toBeLessThanOrEqual(250);
        vi.mocked(getFlags().hasCatalogTools).mockResolvedValue(true);

        const response = await api.fetch(route, { method: 'GET', query: {}, token: apiKey.secret, params });
        expect(response.res.status).toBe(200);
        isSuccess(response.json);
        expect(response.json.next_cursor).toBeNull();
        expect(response.json.data.map((tool) => tool.name)).toEqual(catalog.map((tool) => tool.name).sort());
        for (const tool of catalog) {
            expect(response.json.data.find(({ name }) => name === tool.name)).toMatchObject({
                uuid: null,
                integration_id: params.uniqueKey,
                provider: 'github',
                name: tool.name,
                description: tool.description,
                source: 'tools-catalog',
                meta: { tags: {}, ...(tool.scopes.length && { required_scopes: tool.scopes }) }
            });
        }

        vi.mocked(getFlags().hasCatalogTools).mockResolvedValue(false);
        const disabled = await api.fetch(route, { method: 'GET', query: {}, token: apiKey.secret, params });
        expect(disabled.res.status).toBe(200);
        expect(disabled.json).toStrictEqual({ data: [], next_cursor: null });
    });

    it('prefers a deployed action over a catalog tool with the same name', async () => {
        const { env, apiKey, integration } = await seed();
        const catalog = listCatalogTools('github');
        expect(catalog.length).toBeGreaterThan(1);
        expect(catalog.length).toBeLessThanOrEqual(250);
        const name = 'create-issue';
        expect(catalog.some((tool) => tool.name === name)).toBe(true);
        await seedAction(env.id, integration.id!, name, { enabled: false });
        vi.mocked(getFlags().hasCatalogTools).mockResolvedValue(true);

        const response = await api.fetch(route, { method: 'GET', query: {}, token: apiKey.secret, params });
        expect(response.res.status).toBe(200);
        isSuccess(response.json);
        expect(response.json.next_cursor).toBeNull();
        expect(response.json.data.map((tool) => tool.name)).toEqual(catalog.map((tool) => tool.name).sort());
        expect(response.json.data.filter((tool) => tool.name === name)).toEqual([
            expect.objectContaining({
                uuid: null,
                integration_id: params.uniqueKey,
                provider: 'github',
                name,
                description: 'Legacy action',
                source: 'repo',
                input_json_schema: expect.objectContaining({ $ref: '#/definitions/Input' }),
                output_json_schema: expect.objectContaining({ $ref: '#/definitions/Output' }),
                meta: { tags: {}, required_scopes: ['repo'] }
            })
        ]);
        expect(response.json.data.filter((tool) => tool.source === 'tools-catalog')).toHaveLength(catalog.length - 1);
    });

    it('does not expose tools from another environment', async () => {
        const other = await seed();
        await seedAction(other.env.id, other.integration.id!, 'otherAction');
        (
            await functionConfigService.upsert(db.knex, [{ environmentId: other.env.id, integrationId: params.uniqueKey, name: 'otherFunction', version }])
        ).unwrap();
        const { apiKey } = await seed();
        const response = await api.fetch(route, { method: 'GET', query: {}, token: apiKey.secret, params });
        expect(response.res.status).toBe(200);
        expect(response.json).toStrictEqual({ data: [], next_cursor: null });
    });
});
