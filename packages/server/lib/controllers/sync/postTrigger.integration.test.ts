import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { envs } from '@nangohq/logs';
import { seeders, syncManager } from '@nangohq/shared';

import { runServer, shouldBeProtected } from '../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/sync/trigger';

const mockRunSyncCommand = vi.spyOn(syncManager, 'runSyncCommand').mockResolvedValue({
    success: true,
    response: true,
    error: null
});

describe(`POST ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
        envs.NANGO_LOGS_ENABLED = false;
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'POST',
            // @ts-expect-error don't care
            body: {}
        });

        shouldBeProtected(res);
    });

    describe('validation', () => {
        it('should fail for invalid body', async () => {
            const { env } = await seeders.seedAccountEnvAndUser();

            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: env.secret_key,
                body: {
                    // @ts-expect-error on purpose
                    syncs: [{ invalid: 'object' }, 'valid-sync', null],
                    // @ts-expect-error on purpose
                    full_resync: 'not a boolean'
                },
                headers: {}
            });

            expect(res.res.status).toEqual(400);
            expect(res.json).toStrictEqual({
                error: {
                    code: 'invalid_body',
                    errors: [
                        {
                            code: 'invalid_union',
                            message: 'Each sync must be either a string or a { name: string, variant: string } object',
                            path: ['syncs', 0]
                        },
                        {
                            code: 'invalid_union',
                            message: 'Each sync must be either a string or a { name: string, variant: string } object',
                            path: ['syncs', 2]
                        },
                        {
                            code: 'invalid_type',
                            message: 'Expected boolean, received string',
                            path: ['full_resync']
                        }
                    ]
                }
            });
        });

        it('should return 400 if provider_config_key is missing from body and headers', async () => {
            const { env } = await seeders.seedAccountEnvAndUser();

            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: env.secret_key,
                body: {
                    syncs: ['sync1'],
                    full_resync: true,
                    connection_id: '123'
                },
                headers: {}
            });

            expect(res.res.status).toEqual(400);
            expect(res.json).toStrictEqual({
                error: {
                    code: 'missing_provider_config_key',
                    message: 'Missing provider_config_key. Provide it in the body or headers.'
                }
            });
        });

        it('should return 400 if connection_id is missing from body and headers', async () => {
            const { env } = await seeders.seedAccountEnvAndUser();

            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: env.secret_key,
                body: {
                    syncs: ['sync1'],
                    full_resync: true,
                    provider_config_key: 'test-key'
                },
                headers: {}
            });

            expect(res.res.status).toEqual(400);
            expect(res.json).toStrictEqual({
                error: {
                    code: 'missing_connection_id',
                    message: 'Missing connection_id. Provide it in the body or headers.'
                }
            });
        });
    });

    it('should take provider_config_key and connection_id from headers', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            body: {
                syncs: ['sync1'],
                full_resync: true
            },
            headers: {
                'provider-config-key': 'test-key',
                'connection-id': '123'
            }
        });

        expect(res.res.status).toEqual(200);
    });

    it('should handle syncs as strings', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            body: {
                syncs: ['sync1', 'sync2'],
                full_resync: true,
                provider_config_key: 'test-key',
                connection_id: '123'
            },
            headers: {}
        });

        expect(res.res.status).toEqual(200);
        expect(mockRunSyncCommand).toHaveBeenCalledWith(
            expect.objectContaining({
                command: 'RUN_FULL',
                syncIdentifiers: [
                    { syncName: 'sync1', syncVariant: 'base' },
                    { syncName: 'sync2', syncVariant: 'base' }
                ]
            })
        );
    });

    it('should handle syncs as object', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            body: {
                syncs: [
                    { name: 'sync1', variant: 'v1' },
                    { name: 'sync2', variant: 'v2' }
                ],
                full_resync: true,
                provider_config_key: 'test-key',
                connection_id: '123'
            },
            headers: {}
        });

        expect(res.res.status).toEqual(200);
        expect(mockRunSyncCommand).toHaveBeenCalledWith(
            expect.objectContaining({
                command: 'RUN_FULL',
                syncIdentifiers: [
                    { syncName: 'sync1', syncVariant: 'v1' },
                    { syncName: 'sync2', syncVariant: 'v2' }
                ]
            })
        );
    });

    it.each([
        [true, 'RUN_FULL'],
        [false, 'RUN']
    ])('should handle valid full_resync parameter (%s -> %s)', async (full_resync, expectedCommand) => {
        const { env } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            body: {
                syncs: ['sync1'],
                full_resync,
                provider_config_key: 'test-key',
                connection_id: '123'
            },
            headers: {}
        });

        expect(res.res.status).toEqual(200);
        expect(mockRunSyncCommand).toHaveBeenCalledWith(
            expect.objectContaining({
                command: expectedCommand
            })
        );
    });
});
