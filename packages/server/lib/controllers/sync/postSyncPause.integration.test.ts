import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { envs } from '@nangohq/logs';
import { seeders, syncManager } from '@nangohq/shared';

import { runServer, shouldBeProtected } from '../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/sync/pause';

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

    it('should return 400 for for invalid body', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            body: {
                // @ts-expect-error on purpose
                syncs: [{ invalid: 'object' }, 'valid-sync', null]
            },
            headers: {}
        });

        expect(res.res.status).toEqual(400);
        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_body',
                errors: [
                    { code: 'invalid_union', message: 'Invalid input', path: ['syncs', '0'] },
                    { code: 'invalid_union', message: 'Invalid input', path: ['syncs', '2'] },
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['provider_config_key'] },
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['connection_id'] }
                ]
            }
        });
    });

    it('should handle syncs as strings', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            body: {
                syncs: ['sync1', 'sync2'],
                provider_config_key: 'test-key',
                connection_id: '123'
            },
            headers: {}
        });

        expect(res.res.status).toEqual(200);
        expect(mockRunSyncCommand).toHaveBeenCalledWith(
            expect.objectContaining({
                command: 'PAUSE',
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
                provider_config_key: 'test-key',
                connection_id: '123'
            },
            headers: {}
        });

        expect(res.res.status).toEqual(200);
        expect(mockRunSyncCommand).toHaveBeenCalledWith(
            expect.objectContaining({
                command: 'PAUSE',
                syncIdentifiers: [
                    { syncName: 'sync1', syncVariant: 'v1' },
                    { syncName: 'sync2', syncVariant: 'v2' }
                ]
            })
        );
    });
});
