import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import { remoteFileService, seeders } from '@nangohq/shared';
import { flags } from '@nangohq/utils';

import { isError, runServer, shouldBeProtected } from '../../../../utils/tests.js';

import type { DBOnEventScript, DBSyncConfig } from '@nangohq/types';

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

    it('does not return catalog function code when the feature is disabled', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'aircall', 'aircall');

        const original = flags.hasLiveCatalogActions;
        flags.hasLiveCatalogActions = false;
        try {
            const res = await api.fetch(endpoint, {
                method: 'GET',
                token: apiKey.secret,
                params: { uniqueKey: 'aircall', name: 'create-contact' },
                query: { type: 'action' }
            });

            expect(res.res.status).toBe(404);
            isError(res.json);
            expect(res.json.error.code).toBe('not_found');
            expect(res.json.error.message).toContain('Function');
        } finally {
            flags.hasLiveCatalogActions = original;
        }
    });

    it('returns catalog function code', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'aircall', 'aircall');

        const original = flags.hasLiveCatalogActions;
        flags.hasLiveCatalogActions = true;
        const getFileSpy = vi.spyOn(remoteFileService, 'getFile').mockResolvedValue('catalog source');
        try {
            const res = await api.fetch(endpoint, {
                method: 'GET',
                token: apiKey.secret,
                params: { uniqueKey: 'aircall', name: 'create-contact' },
                query: { type: 'action' }
            });

            expect(res.res.status).toBe(200);
            expect(res.json).toEqual({ type: 'action', code: 'catalog source' });
            expect(getFileSpy).toHaveBeenCalledWith('templates-zero/aircall/actions/create-contact.ts');
        } finally {
            getFileSpy.mockRestore();
            flags.hasLiveCatalogActions = original;
        }
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
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const config = await seeders.createConfigSeed(env, 'github', 'github');
        await insertOnEventScript({ config_id: config.id!, name: 'test-script' });

        // The source file lookup will 404 (no fixture on disk), but it must reach the file lookup —
        // i.e. NOT 404 with a 'Function ... not found' message.
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
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const config = await seeders.createConfigSeed(env, 'github', 'github');

        await insertSyncConfig({ environment_id: env.id, nango_config_id: config.id!, sync_name: 'test-script', type: 'action' });
        await insertOnEventScript({ config_id: config.id!, name: 'test-script' });

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

    it('returns 409 when a deployed sync shares a name with a catalog action', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const config = await seeders.createConfigSeed(env, 'aircall', 'aircall');
        await insertSyncConfig({ environment_id: env.id, nango_config_id: config.id!, sync_name: 'create-contact', type: 'sync' });

        const original = flags.hasLiveCatalogActions;
        flags.hasLiveCatalogActions = true;
        try {
            const res = await api.fetch(endpoint, {
                method: 'GET',
                token: apiKey.secret,
                params: { uniqueKey: 'aircall', name: 'create-contact' },
                query: {}
            });

            expect(res.res.status).toBe(409);
            isError(res.json);
            expect(res.json.error.code).toBe('ambiguous_function');
            expect(res.json.error.payload).toStrictEqual({
                matches: expect.arrayContaining([
                    { type: 'sync', name: 'create-contact' },
                    { type: 'action', name: 'create-contact' }
                ])
            });

            const syncOnly = await api.fetch(endpoint, {
                method: 'GET',
                token: apiKey.secret,
                params: { uniqueKey: 'aircall', name: 'create-contact' },
                query: { type: 'sync' }
            });
            expect(syncOnly.res.status).toBe(404);
            isError(syncOnly.json);
            expect(syncOnly.json.error.code).toBe('not_found');
            expect(syncOnly.json.error.message).toContain('Source file');
        } finally {
            flags.hasLiveCatalogActions = original;
        }
    });
});
