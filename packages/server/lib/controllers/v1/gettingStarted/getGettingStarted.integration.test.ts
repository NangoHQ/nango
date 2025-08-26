import { afterAll, assert, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { getProvider, gettingStartedService, seeders } from '@nangohq/shared';

import { authenticateUser, isSuccess, runServer, shouldBeProtected } from '../../../utils/tests.js';

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
        const { env, user } = await seeders.seedAccountEnvAndUser();
        await seeders.createSharedCredentialsSeed('google-calendar');
        const session = await authenticateUser(api, user);

        const res = await api.fetch(endpoint, { method: 'GET', query: { env: 'dev' }, session });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toMatchObject({
            data: {
                meta: {
                    environment: { id: env.id, name: env.name },
                    integration: {
                        id: expect.any(Number),
                        unique_key: 'google-calendar-getting-started',
                        provider: 'google-calendar',
                        display_name: 'Google Calendar (Getting Started)'
                    }
                },
                connection: null,
                step: 0
            }
        });
    });

    it('creates progress when meta exists without progress', async () => {
        const { env, user, account } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        // Ensure pre-provisioned integration exists
        const provider = getProvider('google-calendar');
        expect(provider).toBeTruthy();
        const integration = await seeders.createPreprovisionedProviderConfigSeed(env, 'google-calendar-getting-started', 'google-calendar', {
            display_name: 'Google Calendar (Getting Started)'
        });

        // Create meta without progress
        const meta = await gettingStartedService.createMeta(db.knex, {
            account_id: account.id,
            environment_id: env.id,
            integration_id: integration.id!
        });
        expect(meta.isOk()).toBe(true);

        // Sanity: no progress for this user
        const existingProgress = await gettingStartedService.getProgressByUserId(db.knex, user.id);
        assert(!existingProgress.isErr());
        expect(existingProgress.value).toBeNull();

        const res = await api.fetch(endpoint, { method: 'GET', query: { env: 'dev' }, session });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toMatchObject({
            data: {
                meta: {
                    environment: { id: env.id, name: env.name },
                    integration: { display_name: integration.display_name, unique_key: integration.unique_key, provider: integration.provider }
                },
                connection: null,
                step: 0
            }
        });
    });

    it('returns existing meta+progress when both exist', async () => {
        const { env, user, account } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        // Create integration
        const integration = await seeders.createPreprovisionedProviderConfigSeed(env, 'google-calendar-getting-started', 'google-calendar', {
            display_name: 'Google Calendar (Getting Started)'
        });

        // Create meta and and progress
        const meta = await gettingStartedService.createMeta(db.knex, {
            account_id: account.id,
            environment_id: env.id,
            integration_id: integration.id!
        });
        assert(!meta.isErr(), 'Failed to create meta');

        // Connection to link to progress
        const connection = await seeders.createConnectionSeed({
            env,
            provider: 'google-calendar-getting-started',
            connectionId: 'demo-conn-id'
        });

        const progress = await gettingStartedService.createProgress(db.knex, {
            user_id: user.id,
            getting_started_meta_id: meta.value.id,
            connection_id: connection.id,
            step: 3
        });
        expect(progress.isErr()).toBe(false);

        const res = await api.fetch(endpoint, { method: 'GET', query: { env: 'dev' }, session });
        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toMatchObject({
            data: {
                meta: {
                    environment: { id: env.id, name: env.name },
                    integration: {
                        id: integration.id,
                        unique_key: integration.unique_key,
                        provider: integration.provider,
                        display_name: integration.display_name
                    }
                },
                connection: { id: connection.id, connection_id: 'demo-conn-id' },
                step: 3
            }
        });
    });

    it('returns connection as null when the linked connection is soft deleted', async () => {
        const { env, user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const gettingStartedProgress = await gettingStartedService.getOrCreateProgressByUser(db.knex, user, env.id);
        expect(gettingStartedProgress.isOk()).toBe(true);

        // Create a connection and link it to the progress
        const connection = await seeders.createConnectionSeed({
            env,
            provider: 'google-calendar-getting-started',
            connectionId: 'test-conn-id'
        });

        // Attach the connection to the progress
        await gettingStartedService.updateByUserId(db.knex, user.id, { connection_id: connection.id });

        // Soft delete the connection (not using service because it has lots of dependencies)
        await db.knex.from('_nango_connections').where({ id: connection.id }).update({ deleted: true, deleted_at: new Date() });

        // Verify the connection is now null in the response
        const res = await api.fetch(endpoint, { method: 'GET', query: { env: 'dev' }, session });
        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toMatchObject({
            data: {
                ...gettingStartedProgress.unwrap(),
                connection: null
            }
        });
    });
});
