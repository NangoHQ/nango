import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import { isError, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../../../utils/tests.js';

import type { DBOnEventScript, DBSyncConfig } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;

const route = '/api/v1/integrations/:providerConfigKey/functions/:functionName/code';

async function insertSyncConfig({
    environment_id,
    nango_config_id,
    sync_name,
    type
}: {
    environment_id: number;
    nango_config_id: number;
    sync_name: string;
    type: 'sync' | 'action' | 'on-event';
}) {
    const now = new Date();
    await db.knex.from<DBSyncConfig>('_nango_sync_configs').insert({
        environment_id,
        sync_name,
        type,
        file_location: 'file_location',
        nango_config_id,
        version: '0.0.0',
        source: 'repo',
        active: true,
        runs: 'runs',
        track_deletes: false,
        auto_start: false,
        webhook_subscriptions: [],
        enabled: true,
        created_at: now,
        updated_at: now,
        models: []
    });
}

async function insertOnEventScript({ config_id, name }: { config_id: number; name: string }) {
    const now = new Date();
    await db.knex.from<DBOnEventScript>('on_event_scripts').insert({
        config_id,
        name,
        file_location: 'file_location',
        version: '0.0.0',
        active: true,
        event: 'POST_CONNECTION_CREATION',
        sdk_version: null,
        created_at: now,
        updated_at: now
    });
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
            params: { providerConfigKey: 'github', functionName: 'get-issues' }
        });

        shouldBeProtected(res);
    });

    it('should enforce env query params', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(
            route,
            // @ts-expect-error missing query on purpose
            { method: 'GET', token: apiKey.secret, params: { providerConfigKey: 'github', functionName: 'get-issues' } }
        );

        shouldRequireQueryEnv(res);
    });

    it('returns 404 when integration is not found', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            query: { env: 'dev' },
            params: { providerConfigKey: 'missing', functionName: 'get-issues' }
        });

        expect(res.res.status).toBe(404);
        isError(res.json);
        expect(res.json.error.code).toBe('not_found');
    });

    it('returns 404 when function name does not exist for the integration', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            query: { env: 'dev' },
            params: { providerConfigKey: 'github', functionName: 'missing-function' }
        });

        expect(res.res.status).toBe(404);
        isError(res.json);
        expect(res.json.error.code).toBe('not_found');
    });

    it('returns 409 ambiguous_function when sync and action share a name', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const config = await seeders.createConfigSeed(env, 'github', 'github');

        await insertSyncConfig({ environment_id: env.id, nango_config_id: config.id!, sync_name: 'shared-name', type: 'sync' });
        await insertSyncConfig({ environment_id: env.id, nango_config_id: config.id!, sync_name: 'shared-name', type: 'action' });

        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            query: { env: 'dev' },
            params: { providerConfigKey: 'github', functionName: 'shared-name' }
        });

        expect(res.res.status).toBe(409);
        isError(res.json);
        expect(res.json.error.code).toBe('ambiguous_function');
        expect(res.json.error.payload).toStrictEqual({
            matches: expect.arrayContaining([
                { type: 'sync', name: 'shared-name' },
                { type: 'action', name: 'shared-name' }
            ])
        });
    });

    it('disambiguates with type and returns the matching function', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const config = await seeders.createConfigSeed(env, 'github', 'github');

        await insertSyncConfig({ environment_id: env.id, nango_config_id: config.id!, sync_name: 'shared-name', type: 'sync' });
        await insertSyncConfig({ environment_id: env.id, nango_config_id: config.id!, sync_name: 'shared-name', type: 'action' });

        // With type the resolver picks the right config; the source file lookup
        // will 404 in tests (no fixture on disk), but it must NOT be 409.
        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            query: { env: 'dev', type: 'sync' },
            params: { providerConfigKey: 'github', functionName: 'shared-name' }
        });

        expect(res.res.status).toBe(404);
        isError(res.json);
        expect(res.json.error.code).toBe('not_found');
        expect(res.json.error.message).toContain('Source file');
    });

    it('finds an on-event script deployed to the environment', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const config = await seeders.createConfigSeed(env, 'github', 'github');
        await insertOnEventScript({ config_id: config.id!, name: 'test-script' });

        // The source file lookup will 404 (no fixture on disk), but it must reach the file lookup —
        // i.e. NOT 404 with a 'Function ... not found' message.
        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            query: { env: 'dev', type: 'on-event' },
            params: { providerConfigKey: 'github', functionName: 'test-script' }
        });

        expect(res.res.status).toBe(404);
        isError(res.json);
        expect(res.json.error.code).toBe('not_found');
        expect(res.json.error.message).toContain('Source file');
    });
});
