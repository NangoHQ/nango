import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../../../utils/tests.js';

import type { DBOnEventScript } from '@nangohq/types';

const route = '/api/v1/integrations/:providerConfigKey/functions';
let api: Awaited<ReturnType<typeof runServer>>;

async function insertOnEventScripts({ configId, scripts }: { configId: number; scripts: { name: string; event: DBOnEventScript['event'] }[] }) {
    await db.knex('on_event_scripts').insert(
        scripts.map((script, index) => ({
            config_id: configId,
            name: script.name,
            file_location: `s3://tests/${configId}/${script.name}-${script.event}-${index}.js`,
            version: '0.0.1',
            active: true,
            event: script.event,
            sdk_version: '0.0.0-yaml'
        }))
    );
}

function toFunctionKey(fn: { type: string; name: string; event?: string }) {
    return `${fn.type}:${fn.name}:${fn.type === 'on-event' ? fn.event : ''}`;
}

describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, { method: 'GET', query: { env: 'dev' }, params: { providerConfigKey: 'test' } });

        shouldBeProtected(res);
    });

    it('should enforce env query params', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(
            route,
            // @ts-expect-error missing query on purpose
            { method: 'GET', token: apiKey.secret, params: { providerConfigKey: 'test' } }
        );

        shouldRequireQueryEnv(res);
    });

    it('should get 404', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            params: { providerConfigKey: 'test' },
            token: apiKey.secret
        });

        isError(res.json);
        expect(res.res.status).toBe(404);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'not_found', message: 'Integration does not exist' }
        });
    });

    it('should return empty list with pagination metadata when integration has no deployed functions', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            params: { providerConfigKey: 'github' },
            token: apiKey.secret
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: [],
            pagination: { total: 0, page: 0, limit: 20 }
        });
    });

    it('should aggregate sync, action, and on-event functions', async () => {
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
        await seeders.createSyncSeeds({
            connectionId: connection.id,
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'my-action',
            type: 'action'
        });
        await insertOnEventScripts({
            configId: integration.id!,
            scripts: [{ name: 'my-on-event', event: 'POST_CONNECTION_CREATION' }]
        });

        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            params: { providerConfigKey: 'github' },
            token: apiKey.secret
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.pagination).toStrictEqual({ total: 3, page: 0, limit: 20 });
        expect(res.json.data.map((f) => ({ name: f.name, type: f.type }))).toStrictEqual([
            { name: 'my-action', type: 'action' },
            { name: 'my-on-event', type: 'on-event' },
            { name: 'my-sync', type: 'sync' }
        ]);

        const onEventEntry = res.json.data.find((f) => f.type === 'on-event');
        expect(onEventEntry?.type === 'on-event' && onEventEntry.event).toBe('post-connection-creation');
        expect(onEventEntry?.source).toBe('repo');
    });

    it('should filter by type=on-event', async () => {
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
        await seeders.createSyncSeeds({
            connectionId: connection.id,
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'my-action',
            type: 'action'
        });
        await insertOnEventScripts({
            configId: integration.id!,
            scripts: [{ name: 'my-on-event', event: 'POST_CONNECTION_CREATION' }]
        });

        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev', type: 'on-event' },
            params: { providerConfigKey: 'github' },
            token: apiKey.secret
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.pagination).toStrictEqual({ total: 1, page: 0, limit: 20 });
        expect(res.json.data).toHaveLength(1);
        expect(res.json.data[0]?.type).toBe('on-event');
        expect(res.json.data[0]?.name).toBe('my-on-event');
    });

    it('should paginate results', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const integration = await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, provider: 'github' });

        for (let i = 0; i < 25; i++) {
            await seeders.createSyncSeeds({
                connectionId: connection.id,
                environment_id: env.id,
                nango_config_id: integration.id!,
                sync_name: `sync-${i.toString().padStart(2, '0')}`,
                type: 'sync'
            });
        }

        const page0 = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev', type: 'sync', page: 0, limit: 10 },
            params: { providerConfigKey: 'github' },
            token: apiKey.secret
        });
        isSuccess(page0.json);
        expect(page0.json.pagination).toStrictEqual({ total: 25, page: 0, limit: 10 });
        expect(page0.json.data).toHaveLength(10);

        const page2 = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev', type: 'sync', page: 2, limit: 10 },
            params: { providerConfigKey: 'github' },
            token: apiKey.secret
        });
        isSuccess(page2.json);
        expect(page2.json.pagination).toStrictEqual({ total: 25, page: 2, limit: 10 });
        expect(page2.json.data).toHaveLength(5);

        const page0Names = page0.json.data.map((f) => f.name);
        const page2Names = page2.json.data.map((f) => f.name);
        expect(page0Names.some((name) => page2Names.includes(name))).toBe(false);
    });

    it('should paginate on-event results deterministically when multiple scripts share the same name', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const integration = await seeders.createConfigSeed(env, 'github', 'github');

        await insertOnEventScripts({
            configId: integration.id!,
            scripts: [
                { name: 'shared-script', event: 'POST_CONNECTION_CREATION' },
                { name: 'shared-script', event: 'PRE_CONNECTION_DELETION' },
                { name: 'shared-script', event: 'VALIDATE_CONNECTION' }
            ]
        });

        const page0 = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev', type: 'on-event', page: 0, limit: 2 },
            params: { providerConfigKey: 'github' },
            token: apiKey.secret
        });
        isSuccess(page0.json);
        expect(page0.json.pagination).toStrictEqual({ total: 3, page: 0, limit: 2 });

        const page1 = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev', type: 'on-event', page: 1, limit: 2 },
            params: { providerConfigKey: 'github' },
            token: apiKey.secret
        });
        isSuccess(page1.json);
        expect(page1.json.pagination).toStrictEqual({ total: 3, page: 1, limit: 2 });

        const page0Keys = page0.json.data.map(toFunctionKey);
        const page1Keys = page1.json.data.map(toFunctionKey);

        expect(page0Keys).toStrictEqual(['on-event:shared-script:post-connection-creation', 'on-event:shared-script:pre-connection-deletion']);
        expect(page1Keys).toStrictEqual(['on-event:shared-script:validate-connection']);
        expect(page0Keys.some((key) => page1Keys.includes(key))).toBe(false);
    });

    it('should paginate merged function listings deterministically across function tables', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const integration = await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, provider: 'github' });

        await seeders.createSyncSeeds({
            connectionId: connection.id,
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'action-a',
            type: 'action'
        });
        await seeders.createSyncSeeds({
            connectionId: connection.id,
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'action-b',
            type: 'action'
        });
        await seeders.createSyncSeeds({
            connectionId: connection.id,
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'sync-a',
            type: 'sync'
        });
        await seeders.createSyncSeeds({
            connectionId: connection.id,
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'sync-b',
            type: 'sync'
        });
        await insertOnEventScripts({
            configId: integration.id!,
            scripts: [
                { name: 'shared-script', event: 'POST_CONNECTION_CREATION' },
                { name: 'shared-script', event: 'PRE_CONNECTION_DELETION' }
            ]
        });

        const page0 = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev', page: 0, limit: 3 },
            params: { providerConfigKey: 'github' },
            token: apiKey.secret
        });
        isSuccess(page0.json);
        expect(page0.json.pagination).toStrictEqual({ total: 6, page: 0, limit: 3 });

        const page1 = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev', page: 1, limit: 3 },
            params: { providerConfigKey: 'github' },
            token: apiKey.secret
        });
        isSuccess(page1.json);
        expect(page1.json.pagination).toStrictEqual({ total: 6, page: 1, limit: 3 });

        const page0Keys = page0.json.data.map(toFunctionKey);
        const page1Keys = page1.json.data.map(toFunctionKey);

        expect(page0Keys).toStrictEqual(['action:action-a:', 'action:action-b:', 'on-event:shared-script:post-connection-creation']);
        expect(page1Keys).toStrictEqual(['on-event:shared-script:pre-connection-deletion', 'sync:sync-a:', 'sync:sync-b:']);
        expect(page0Keys.some((key) => page1Keys.includes(key))).toBe(false);
    });

    it('should return total even when page is out of range', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const integration = await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, provider: 'github' });

        for (let i = 0; i < 3; i++) {
            await seeders.createSyncSeeds({
                connectionId: connection.id,
                environment_id: env.id,
                nango_config_id: integration.id!,
                sync_name: `sync-${i}`,
                type: 'sync'
            });
        }

        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev', type: 'sync', page: 5, limit: 10 },
            params: { providerConfigKey: 'github' },
            token: apiKey.secret
        });

        isSuccess(res.json);
        expect(res.json.pagination).toStrictEqual({ total: 3, page: 5, limit: 10 });
        expect(res.json.data).toHaveLength(0);
    });

    it('should reject invalid type query', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(route, {
            method: 'GET',
            // @ts-expect-error invalid type on purpose
            query: { env: 'dev', type: 'bogus' },
            params: { providerConfigKey: 'github' },
            token: apiKey.secret
        });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json.error.code).toBe('invalid_query_params');
    });
});
