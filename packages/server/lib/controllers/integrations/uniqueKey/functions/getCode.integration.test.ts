import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import { isError, runServer, shouldBeProtected } from '../../../../utils/tests.js';

import type { DBSyncConfig } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/integrations/:uniqueKey/functions/:name/code';

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

describe(`GET ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    it('protects the endpoint', async () => {
        const res = await api.fetch(endpoint, {
            method: 'GET',
            params: { uniqueKey: 'github', name: 'get-issues' },
            query: {}
        });

        shouldBeProtected(res);
    });

    it('returns 404 when integration is not found', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            params: { uniqueKey: 'missing', name: 'get-issues' },
            query: {}
        });

        expect(res.res.status).toBe(404);
        isError(res.json);
        expect(res.json.error.code).toBe('not_found');
    });

    it('returns 404 when function name does not exist for the integration', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            params: { uniqueKey: 'github', name: 'missing-function' },
            query: {}
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

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            params: { uniqueKey: 'github', name: 'shared-name' },
            query: {}
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

    it('disambiguates with --type and returns the matching function', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const config = await seeders.createConfigSeed(env, 'github', 'github');

        await insertSyncConfig({ environment_id: env.id, nango_config_id: config.id!, sync_name: 'shared-name', type: 'sync' });
        await insertSyncConfig({ environment_id: env.id, nango_config_id: config.id!, sync_name: 'shared-name', type: 'action' });

        // With --type the resolver picks the right config; the source file lookup
        // will 404 in tests (no fixture on disk), but it must NOT be 409.
        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            params: { uniqueKey: 'github', name: 'shared-name' },
            query: { type: 'sync' }
        });

        expect(res.res.status).toBe(404);
        isError(res.json);
        expect(res.json.error.code).toBe('not_found');
        expect(res.json.error.message).toContain('Source file');
    });

    it('finds an on-event script deployed to the environment', async () => {
        const { account, env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        await seeders.createOnEventScript({ account, environment: env, providerConfigKey: 'github', sdkVersion: '0.0.0-yaml' });

        // Seeder creates a script named 'test-script'. The source file lookup will 404
        // in tests (no fixture on disk), but it must reach the file lookup — i.e. NOT 404 with a 'Function ... not found' message.
        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            params: { uniqueKey: 'github', name: 'test-script' },
            query: { type: 'on-event' }
        });

        expect(res.res.status).toBe(404);
        isError(res.json);
        expect(res.json.error.code).toBe('not_found');
        expect(res.json.error.message).toContain('Source file');
    });

    it('returns 409 ambiguous_function when an action and an on-event script share a name', async () => {
        const { account, env, apiKey } = await seeders.seedAccountEnvAndUser();
        const config = await seeders.createConfigSeed(env, 'github', 'github');

        await insertSyncConfig({ environment_id: env.id, nango_config_id: config.id!, sync_name: 'test-script', type: 'action' });
        await seeders.createOnEventScript({ account, environment: env, providerConfigKey: 'github', sdkVersion: '0.0.0-yaml' });

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            params: { uniqueKey: 'github', name: 'test-script' },
            query: {}
        });

        expect(res.res.status).toBe(409);
        isError(res.json);
        expect(res.json.error.code).toBe('ambiguous_function');
        expect(res.json.error.payload).toStrictEqual({
            matches: expect.arrayContaining([
                { type: 'action', name: 'test-script' },
                { type: 'on-event', name: 'test-script' }
            ])
        });
    });
});
