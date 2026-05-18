import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../../../utils/tests.js';

import type { DBOnEventScript } from '@nangohq/types';

const route = '/api/v1/integrations/:providerConfigKey/functions/:functionName';
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

describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            params: { providerConfigKey: 'test', functionName: 'some-fn' }
        });
        shouldBeProtected(res);
    });

    it('should enforce env query params', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(
            route,
            // @ts-expect-error missing query on purpose
            { method: 'GET', token: apiKey.secret, params: { providerConfigKey: 'test', functionName: 'some-fn' } }
        );
        shouldRequireQueryEnv(res);
    });

    it('should 404 when integration does not exist', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            params: { providerConfigKey: 'missing', functionName: 'some-fn' },
            token: apiKey.secret
        });

        isError(res.json);
        expect(res.res.status).toBe(404);
        expect(res.json.error.code).toBe('not_found');
    });

    it('should 404 when function does not exist on the integration', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            params: { providerConfigKey: 'github', functionName: 'does-not-exist' },
            token: apiKey.secret
        });

        isError(res.json);
        expect(res.res.status).toBe(404);
        expect(res.json.error.code).toBe('not_found');
    });

    it('should return a sync function', async () => {
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

        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            params: { providerConfigKey: 'github', functionName: 'my-sync' },
            token: apiKey.secret
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.data.name).toBe('my-sync');
        expect(res.json.data.type).toBe('sync');
    });

    it('should return an action function', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const integration = await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, provider: 'github' });

        await seeders.createSyncSeeds({
            connectionId: connection.id,
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'my-action',
            type: 'action'
        });

        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            params: { providerConfigKey: 'github', functionName: 'my-action' },
            token: apiKey.secret
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.data.name).toBe('my-action');
        expect(res.json.data.type).toBe('action');
    });

    it('should return an on-event function', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const integration = await seeders.createConfigSeed(env, 'github', 'github');

        await insertOnEventScripts({
            configId: integration.id!,
            scripts: [{ name: 'my-on-event', event: 'POST_CONNECTION_CREATION' }]
        });

        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            params: { providerConfigKey: 'github', functionName: 'my-on-event' },
            token: apiKey.secret
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.data.name).toBe('my-on-event');
        expect(res.json.data.type).toBe('on-event');
        if (res.json.data.type === 'on-event') {
            expect(res.json.data.event).toBe('post-connection-creation');
        }
    });

    it('should disambiguate name collisions across types via ?type=', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const integration = await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, provider: 'github' });

        await seeders.createSyncSeeds({
            connectionId: connection.id,
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'shared-name',
            type: 'sync'
        });
        await insertOnEventScripts({
            configId: integration.id!,
            scripts: [{ name: 'shared-name', event: 'POST_CONNECTION_CREATION' }]
        });

        const withoutType = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            params: { providerConfigKey: 'github', functionName: 'shared-name' },
            token: apiKey.secret
        });
        isSuccess(withoutType.json);
        // First-match by `type ASC` ordering — 'on-event' < 'sync' alphabetically.
        expect(withoutType.json.data.type).toBe('on-event');

        const onEventTyped = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev', type: 'on-event' },
            params: { providerConfigKey: 'github', functionName: 'shared-name' },
            token: apiKey.secret
        });
        isSuccess(onEventTyped.json);
        expect(onEventTyped.json.data.type).toBe('on-event');

        const syncTyped = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev', type: 'sync' },
            params: { providerConfigKey: 'github', functionName: 'shared-name' },
            token: apiKey.secret
        });
        isSuccess(syncTyped.json);
        expect(syncTyped.json.data.type).toBe('sync');
    });

    it('should 404 when type filter eliminates the match', async () => {
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

        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev', type: 'action' },
            params: { providerConfigKey: 'github', functionName: 'my-sync' },
            token: apiKey.secret
        });

        isError(res.json);
        expect(res.res.status).toBe(404);
        expect(res.json.error.code).toBe('not_found');
    });

    it('should reject invalid type query', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(route, {
            method: 'GET',
            // @ts-expect-error invalid type on purpose
            query: { env: 'dev', type: 'bogus' },
            params: { providerConfigKey: 'github', functionName: 'my-sync' },
            token: apiKey.secret
        });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json.error.code).toBe('invalid_query_params');
    });
});
