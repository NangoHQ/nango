import { afterAll, assert, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { gettingStartedService, seeders } from '@nangohq/shared';

import { authenticateUser, isError, runServer, shouldBeProtected } from '../../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/api/v1/getting-started';

describe(`PATCH ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, { method: 'PATCH', query: { env: 'dev' }, body: { step: 1 } });
        shouldBeProtected(res);
    });

    it('should validate body schema', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            token: env.secret_key,
            query: { env: env.name },
            // @ts-expect-error on purpose
            body: { step: 'invalid' }
        });

        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                errors: [{ code: 'invalid_type', message: 'Invalid input: expected number, received string', path: ['step'] }]
            }
        });
    });

    it('should validate step is non-negative integer', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            token: env.secret_key,
            query: { env: 'dev' },
            body: { step: -1 }
        });

        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                errors: [{ code: 'too_small', message: 'Too small: expected number to be >=0', path: ['step'] }]
            }
        });
    });

    it('should update step and closed', async () => {
        const { env, user, account } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        // Ensure integration exists
        const integration = await seeders.createPreprovisionedProviderConfigSeed(env, 'google-calendar-getting-started', 'google-calendar');

        // Create meta and progress
        const meta = await gettingStartedService.createMeta(db.knex, {
            account_id: account.id,
            environment_id: env.id,
            integration_id: integration.id!
        });
        assert(!meta.isErr(), 'Failed to create meta');

        const progress = await gettingStartedService.createProgress(db.knex, {
            user_id: user.id,
            getting_started_meta_id: meta.value.id,
            step: 0,
            connection_id: null,
            closed: false
        });
        expect(progress.isOk()).toBe(true);

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            session,
            query: { env: env.name },
            body: { step: 2, closed: true }
        });

        expect(res.res.status).toBe(204);

        // Verify the step was updated in the database
        const updatedProgress = await gettingStartedService.getProgressByUserId(db.knex, user.id);
        assert(!updatedProgress.isErr(), 'Failed to get progress');

        expect(updatedProgress.value?.step).toBe(2);
        expect(updatedProgress.value?.closed).toBe(true);
    });

    it('should attach a connection', async () => {
        const { env, user, account } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        // Ensure integration exists
        const integration = await seeders.createPreprovisionedProviderConfigSeed(env, 'google-calendar-getting-started', 'google-calendar');

        // Create meta and progress
        const meta = await gettingStartedService.createMeta(db.knex, {
            account_id: account.id,
            environment_id: env.id,
            integration_id: integration.id!
        });
        assert(!meta.isErr(), 'Failed to create meta');

        const progress = await gettingStartedService.createProgress(db.knex, {
            user_id: user.id,
            getting_started_meta_id: meta.value.id,
            step: 0,
            connection_id: null,
            closed: false
        });
        expect(progress.isOk()).toBe(true);

        // Create a connection to attach
        const connection = await seeders.createConnectionSeed({
            env,
            provider: 'google-calendar-getting-started'
        });

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            session,
            query: { env: env.name },
            body: { connection_id: connection.connection_id }
        });

        expect(res.res.status).toBe(204);

        // Verify the connection was attached in the database
        const updatedProgress = await gettingStartedService.getProgressByUserId(db.knex, user.id);
        assert(!updatedProgress.isErr(), 'Failed to get progress');

        expect(updatedProgress.value?.connection?.id).toBe(connection.id);
    });

    it('should detach a connection when connection_id is null', async () => {
        const { env, user, account } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        // Ensure integration exists
        const integration = await seeders.createPreprovisionedProviderConfigSeed(env, 'google-calendar-getting-started', 'google-calendar');

        // Create a connection to initially attach
        const connection = await seeders.createConnectionSeed({
            env,
            provider: 'google-calendar-getting-started'
        });

        // Create meta and progress with connection already attached
        const meta = await gettingStartedService.createMeta(db.knex, {
            account_id: account.id,
            environment_id: env.id,
            integration_id: integration.id!
        });
        assert(!meta.isErr(), 'Failed to create meta');

        const progress = await gettingStartedService.createProgress(db.knex, {
            user_id: user.id,
            getting_started_meta_id: meta.value.id,
            step: 2,
            connection_id: connection.id,
            closed: false
        });
        expect(progress.isOk()).toBe(true);

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            session,
            query: { env: env.name },
            body: { connection_id: null }
        });

        expect(res.res.status).toBe(204);

        // Verify the connection was detached in the database
        const updatedProgress = await gettingStartedService.getProgressByUserId(db.knex, user.id);
        assert(!updatedProgress.isErr(), 'Failed to get progress');

        expect(updatedProgress.value?.connection).toBeNull();
    });

    it('should return 404 when connection_id does not exist', async () => {
        const { env, user, account } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        // Ensure integration exists
        const integration = await seeders.createPreprovisionedProviderConfigSeed(env, 'google-calendar-getting-started', 'google-calendar');

        // Create meta and progress
        const meta = await gettingStartedService.createMeta(db.knex, {
            account_id: account.id,
            environment_id: env.id,
            integration_id: integration.id!
        });
        assert(!meta.isErr(), 'Failed to create meta');

        const progress = await gettingStartedService.createProgress(db.knex, {
            user_id: user.id,
            getting_started_meta_id: meta.value.id,
            step: 0,
            connection_id: null,
            closed: false
        });
        expect(progress.isOk()).toBe(true);

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            session,
            query: { env: env.name },
            body: { connection_id: 'non-existent-connection' }
        });

        expect(res.res.status).toBe(404);
        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'connection_not_found',
                message: 'connection_not_found'
            }
        });
    });

    it('should handle no-op updates gracefully', async () => {
        const { env, user, account } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        // Ensure integration exists
        const integration = await seeders.createPreprovisionedProviderConfigSeed(env, 'google-calendar-getting-started', 'google-calendar');

        // Create meta and progress
        const meta = await gettingStartedService.createMeta(db.knex, {
            account_id: account.id,
            environment_id: env.id,
            integration_id: integration.id!
        });
        assert(!meta.isErr(), 'Failed to create meta');

        const progress = await gettingStartedService.createProgress(db.knex, {
            user_id: user.id,
            getting_started_meta_id: meta.value.id,
            step: 1,
            connection_id: null,
            closed: false
        });
        expect(progress.isOk()).toBe(true);

        // Send request with no actual changes
        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            session,
            query: { env: env.name },
            body: {}
        });

        expect(res.res.status).toBe(204);

        // Verify nothing changed in the database
        const updatedProgress = await gettingStartedService.getProgressByUserId(db.knex, user.id);
        assert(!updatedProgress.isErr(), 'Failed to get progress');

        expect(updatedProgress.value?.step).toBe(1);
    });

    it('should fail if getting_started_progress does not exist', async () => {
        const { env, user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            session,
            query: { env: env.name },
            body: { step: 1 }
        });

        expect(res.res.status).toBe(404);
        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'getting_started_progress_not_found',
                message: 'getting_started_progress_not_found'
            }
        });
    });
});
