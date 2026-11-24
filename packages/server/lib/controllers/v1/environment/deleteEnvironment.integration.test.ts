import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import { environmentService, getProvider, PROD_ENVIRONMENT_NAME, seeders } from '@nangohq/shared';
import { createConfigSeed } from '@nangohq/shared/lib/seeders/config.seeder.js';
import { createSyncSeeds } from '@nangohq/shared/lib/seeders/index.js';
import { Err, getLogger, Ok } from '@nangohq/utils';

import { envs } from '../../../env.js';
import { deleteEnvironmentTask, tasks } from '../../../tasks/index.js';
import { authenticateUser, isError, runServer, shouldBeProtected } from '../../../utils/tests.js';

import type * as serverUtils from '../../../utils/utils.js';
import type { DBConnection, DBEnvironment } from '@nangohq/types';

vi.mock('../../../utils/utils.js', async (importOriginal) => {
    const actual = await importOriginal<typeof serverUtils>();
    return {
        ...actual,
        getOrchestrator: () => ({
            deleteSyncs: () => Promise.resolve(Ok(undefined)),
            deleteFunctionSchedules: () => Promise.resolve(Ok(undefined))
        })
    };
});

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/api/v1/environments';

describe(`DELETE ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'DELETE',
            // @ts-expect-error query params are required
            query: { env: 'test' }
        });

        shouldBeProtected(res);
    });

    it('should not allow deleting prod environment', async () => {
        const { account, user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);
        (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: PROD_ENVIRONMENT_NAME })).unwrap();

        const res = await api.fetch(endpoint, {
            method: 'DELETE',
            // @ts-expect-error query params are required
            query: { env: PROD_ENVIRONMENT_NAME },
            session
        });

        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json).toStrictEqual({
            error: {
                code: 'cannot_delete_prod_environment',
                message: 'Cannot delete prod environment'
            }
        });
    });

    it('should successfully soft-delete a non-prod environment', async () => {
        const { account, user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);
        const testEnv = (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: 'test-delete' })).unwrap().environment;

        const res = await api.fetch(endpoint, {
            method: 'DELETE',
            // @ts-expect-error query params are required
            query: { env: testEnv.name },
            session
        });

        expect(res.res.status).toBe(204);

        const deletedEnv = await environmentService.getById(testEnv.id);
        expect(deletedEnv).toBeNull();

        const rawEnv = await db.knex<DBEnvironment>('_nango_environments').where({ id: testEnv.id }).first();
        expect(rawEnv?.deleted).toBe(true);
    });

    it('should soft-delete immediately and asynchronously hard-delete configs, syncs, connections, and oauth sessions via deleteEnvironmentTask', async () => {
        const { account, user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);
        const testEnv = (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: 'test-delete-related' })).unwrap().environment;

        const providerName = 'github';
        const provider = getProvider(providerName);
        if (!provider) {
            throw new Error(`Provider ${providerName} not found`);
        }

        const providerConfig = await createConfigSeed(testEnv, providerName, providerName);
        if (!providerConfig?.id) {
            throw new Error('Failed to seed provider config');
        }

        const [connection] = await db.knex
            .from<DBConnection>('_nango_connections')
            .insert({
                environment_id: testEnv.id,
                connection_id: 'test-connection-id',
                provider_config_key: providerName,
                config_id: providerConfig.id,
                deleted: false,
                credentials: {}
            })
            .returning('*');
        if (!connection) {
            throw new Error('Failed to seed connection');
        }

        const { syncConfig, sync } = await createSyncSeeds({
            connectionId: connection.id,
            environment_id: testEnv.id,
            nango_config_id: providerConfig.id,
            sync_name: 'test-sync',
            type: 'sync'
        });

        await db.knex('_nango_oauth_sessions').insert({
            id: randomUUID(),
            connection_id: connection.connection_id,
            provider_config_key: providerName,
            provider: providerName,
            environment_id: testEnv.id,
            callback_url: 'http://localhost/oauth/callback',
            auth_mode: 'OAUTH2'
        });

        const res = await api.fetch(endpoint, {
            method: 'DELETE',
            // @ts-expect-error query params are required
            query: { env: testEnv.name },
            session
        });

        expect(res.res.status).toBe(204);
        expect(await environmentService.getById(testEnv.id)).toBeNull();

        const enqueued = await db.knex
            .withSchema(envs.TASKS_DATABASE_SCHEMA)
            .from('tasks')
            .whereRaw("name LIKE 'deleteEnvironment:%' AND payload->>'environmentId' = ?", [String(testEnv.id)])
            .first<{ id: string }>();
        expect(enqueued).toBeDefined();

        const taskRes = await deleteEnvironmentTask.handle({ environmentId: testEnv.id }, { taskId: 'test', attempt: 0, logger: getLogger('test') });
        expect(taskRes.isOk()).toBe(true);

        expect(await db.knex.from('_nango_environments').where({ id: testEnv.id }).first()).toBeUndefined();
        expect(await db.knex.from('_nango_configs').where({ id: providerConfig.id }).first()).toBeUndefined();
        expect(await db.knex.from('_nango_sync_configs').where({ id: syncConfig.id }).first()).toBeUndefined();
        expect(await db.knex.from('_nango_syncs').where({ id: sync.id }).first()).toBeUndefined();
        expect(await db.knex.from('_nango_connections').where({ id: connection.id }).first()).toBeUndefined();
        expect(await db.knex.from('_nango_oauth_sessions').where({ environment_id: testEnv.id }).first()).toBeUndefined();
    });

    it('should serialize concurrent DELETE requests so an enqueue failure rolls back cleanly for the next request', async () => {
        const { account, user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);
        const testEnv = (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: 'test-concurrent-delete' })).unwrap().environment;

        vi.spyOn(tasks, 'enqueue').mockResolvedValueOnce(Err(new Error('transient queue error')));

        const [first, second] = await Promise.all([
            api.fetch(endpoint, {
                method: 'DELETE',
                // @ts-expect-error query params are required
                query: { env: testEnv.name },
                session
            }),
            api.fetch(endpoint, {
                method: 'DELETE',
                // @ts-expect-error query params are required
                query: { env: testEnv.name },
                session
            })
        ]);

        expect([first.res.status, second.res.status].sort((a, b) => a - b)).toEqual([204, 500]);
        expect(await environmentService.getById(testEnv.id)).toBeNull();

        const enqueuedCount = await db.knex
            .withSchema(envs.TASKS_DATABASE_SCHEMA)
            .from('tasks')
            .whereRaw("name LIKE 'deleteEnvironment:%' AND payload->>'environmentId' = ?", [String(testEnv.id)])
            .count<{ count: string }[]>('* as count')
            .first();
        expect(Number(enqueuedCount?.count)).toBe(1);
    });
});
