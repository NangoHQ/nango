import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { configService, getProvider, gettingStartedService, seeders } from '@nangohq/shared';

import { authenticateUser, isSuccess, runServer, shouldBeProtected } from '../../../utils/tests.js';
import { getOrchestrator } from '../../../utils/utils.js';

import type { DBGettingStartedMeta, DBGettingStartedProgress } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/api/v1/getting-started';

describe(`GET ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, { method: 'GET', query: { env: 'dev' } });
        shouldBeProtected(res);
    });

    it("creates meta+integration when they don't exist", async () => {
        const { env, user, account } = await seeders.seedAccountEnvAndUser();
        await seeders.createSharedCredentialsSeed('google-calendar');
        const session = await authenticateUser(api, user);

        // Ensure no getting_started_meta exists for this account
        await db.knex.from<DBGettingStartedMeta>('getting_started_meta').where({ account_id: account.id }).delete();

        const res = await api.fetch(endpoint, { method: 'GET', query: { env: 'dev' }, session });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toMatchObject({
            data: {
                meta: {
                    environment: { id: env.id },
                    integration: { unique_key: 'google-calendar-getting-started', environment_id: env.id }
                },
                connection: null,
                step: 0,
                complete: false
            }
        });

        // Validate DB state: meta and progress exist
        const meta = await db.knex.from<DBGettingStartedMeta>('getting_started_meta').where({ account_id: account.id }).first();
        if (!meta) {
            throw new Error('Failed to create getting_started_meta');
        }
        const progress = await db.knex
            .from<DBGettingStartedProgress>('getting_started_progress')
            .where({ user_id: user.id, getting_started_meta_id: meta.id })
            .first();
        expect(progress).toBeTruthy();
    });

    it('creates progress when meta exists without progress', async () => {
        const { env, user, account } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        // Ensure pre-provisioned integration exists
        const provider = getProvider('google-calendar');
        expect(provider).toBeTruthy();
        const integration = await seeders.createPreprovisionedProviderConfigSeed(env, 'google-calendar-getting-started', 'google-calendar');

        // Create meta without progress
        const [meta] = await db.knex
            .from<DBGettingStartedMeta>('getting_started_meta')
            .insert({ account_id: account.id, environment_id: env.id, integration_id: integration.id! })
            .returning('*');
        if (!meta) throw new Error('Failed to create getting_started_meta');

        // Sanity: no progress for this user
        const existingProgress = await db.knex
            .from<DBGettingStartedProgress>('getting_started_progress')
            .where({ user_id: user.id, getting_started_meta_id: meta.id })
            .first();
        expect(existingProgress).toBeFalsy();

        const res = await api.fetch(endpoint, { method: 'GET', query: { env: 'dev' }, session });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toMatchObject({
            data: {
                meta: { environment: { id: env.id }, integration: { environment_id: env.id } },
                connection: null,
                step: 0,
                complete: false
            }
        });

        const progress = await db.knex
            .from<DBGettingStartedProgress>('getting_started_progress')
            .where({ user_id: user.id, getting_started_meta_id: meta.id })
            .first();
        expect(progress).toBeTruthy();
    });

    it('returns existing meta+progress when both exist', async () => {
        const { env, user, account } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        // Ensure integration exists
        const integration = await seeders.createPreprovisionedProviderConfigSeed(env, 'google-calendar-getting-started', 'google-calendar');

        // Create meta and a progress row with some data
        const [meta] = await db.knex
            .from<DBGettingStartedMeta>('getting_started_meta')
            .insert({ account_id: account.id, environment_id: env.id, integration_id: integration.id! })
            .returning('*');

        // Also create a fake connection and link it
        const connection = await seeders.createConnectionSeed({
            env,
            provider: 'google-calendar-getting-started',
            connectionId: 'demo-conn-id'
        });

        const [progress] = await db.knex
            .from<DBGettingStartedProgress>('getting_started_progress')
            .insert({ user_id: user.id, getting_started_meta_id: meta!.id, step: 3, complete: true, connection_id: connection.id })
            .returning('*');
        if (!progress) throw new Error('Failed to create progress');
        const progressId = progress.id;

        const res = await api.fetch(endpoint, { method: 'GET', query: { env: 'dev' }, session });
        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toMatchObject({
            data: {
                meta: { environment: { id: env.id }, integration: { unique_key: 'google-calendar-getting-started' } },
                connection: { id: connection.id, connection_id: 'demo-conn-id' },
                step: 3,
                complete: true
            }
        });

        // Ensure existing row was not altered unexpectedly
        const fresh = (await db.knex.from<DBGettingStartedProgress>('getting_started_progress').where({ id: progressId }).first()) as
            | DBGettingStartedProgress
            | undefined;
        expect(fresh?.step).toBe(3);
        expect(fresh?.complete).toBe(true);
        expect(fresh?.connection_id).toBe(connection.id);
    });

    it('returns connection as null when the linked connection is soft deleted', async () => {
        const { env, user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const gettingStartedProgress = await gettingStartedService.getOrCreateProgressByUser(user, env.id);
        expect(gettingStartedProgress.isOk()).toBe(true);

        // Create a connection and link it to the progress
        const connection = await seeders.createConnectionSeed({
            env,
            provider: 'google-calendar-getting-started',
            connectionId: 'test-conn-id'
        });

        // Attach the connection to the progress
        await gettingStartedService.updateByUserId(user.id, { connection_id: connection.id });

        // Soft delete the connection (not using service because it has lots of dependencies)
        await db.knex.from('_nango_connections').where({ id: connection.id }).update({ deleted: true, deleted_at: new Date() });

        // Verify the connection is now null in the response
        const res = await api.fetch(endpoint, { method: 'GET', query: { env: 'dev' }, session });
        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toMatchObject({
            data: {
                meta: { environment: { id: env.id }, integration: { unique_key: 'google-calendar-getting-started' } },
                connection: null,
                step: 0,
                complete: false
            }
        });
    });
});
