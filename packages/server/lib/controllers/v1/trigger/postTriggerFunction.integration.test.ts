import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { envs } from '@nangohq/logs';
import { seeders, syncManager } from '@nangohq/shared';

import { authenticateUser, isError, runServer, shouldBeProtected } from '../../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/api/v1/trigger/function';

const mockRunSyncCommand = vi.spyOn(syncManager, 'runSyncCommand').mockResolvedValue({
    success: true,
    response: true,
    error: null
});

describe(`POST ${endpoint}`, () => {
    let logsEnabled: boolean;

    beforeAll(async () => {
        api = await runServer();
        logsEnabled = envs.NANGO_LOGS_ENABLED;
        envs.NANGO_LOGS_ENABLED = false;
    });
    afterAll(() => {
        envs.NANGO_LOGS_ENABLED = logsEnabled;
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'dev' },
            body: { type: 'sync', function_name: 'sync1', provider_config_key: 'test-key', connection_id: 'conn1' }
        });

        shouldBeProtected(res);
    });

    it('should require the env query param', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const res = await api.fetch(endpoint, {
            method: 'POST',
            // @ts-expect-error intentionally omitting required query
            query: {},
            body: { type: 'sync', function_name: 'sync1', provider_config_key: 'test-key', connection_id: 'conn1' },
            session
        });

        isError(res.json);
        // sessionAuth middleware validates env and returns 401 for missing/invalid env
        expect(res.res.status).toBe(401);
        expect(res.json.error.code).toBe('invalid_env');
    });

    describe('body validation', () => {
        it('should return 400 when type is missing', async () => {
            const { user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);

            const res = await api.fetch(endpoint, {
                method: 'POST',
                query: { env: 'dev' },
                // @ts-expect-error intentionally invalid body
                body: { function_name: 'sync1', provider_config_key: 'test-key', connection_id: 'conn1' },
                session
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_body');
        });

        it('should return 400 when type is invalid', async () => {
            const { user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);

            const res = await api.fetch(endpoint, {
                method: 'POST',
                query: { env: 'dev' },
                // @ts-expect-error intentionally invalid body
                body: { type: 'webhook', function_name: 'sync1', provider_config_key: 'test-key', connection_id: 'conn1' },
                session
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_body');
        });

        it('should return 400 when function_name is missing', async () => {
            const { user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);

            const res = await api.fetch(endpoint, {
                method: 'POST',
                query: { env: 'dev' },
                // @ts-expect-error intentionally invalid body
                body: { type: 'sync', provider_config_key: 'test-key', connection_id: 'conn1' },
                session
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_body');
        });

        it('should return 400 when provider_config_key is missing', async () => {
            const { user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);

            const res = await api.fetch(endpoint, {
                method: 'POST',
                query: { env: 'dev' },
                // @ts-expect-error intentionally invalid body
                body: { type: 'sync', function_name: 'sync1', connection_id: 'conn1' },
                session
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_body');
        });
    });

    describe('sync', () => {
        it('should call syncManager.runSyncCommand with RUN and correct identifiers', async () => {
            const { user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);

            const res = await api.fetch(endpoint, {
                method: 'POST',
                query: { env: 'dev' },
                body: { type: 'sync', function_name: 'my-sync', provider_config_key: 'test-key', connection_id: 'conn1' },
                session
            });

            expect(res.res.status).toBe(200);
            expect(mockRunSyncCommand).toHaveBeenCalledWith(
                expect.objectContaining({
                    command: 'RUN',
                    providerConfigKey: 'test-key',
                    connectionId: 'conn1',
                    syncIdentifiers: [{ syncName: 'my-sync', syncVariant: 'base' }]
                })
            );
        });
    });

    describe('action', () => {
        it('should return 400 for unknown connection', async () => {
            const { user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);

            const res = await api.fetch(endpoint, {
                method: 'POST',
                query: { env: 'dev' },
                body: { type: 'action', function_name: 'my-action', provider_config_key: 'test-key', connection_id: 'nonexistent' },
                session
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('unknown_connection');
        });
    });
});
