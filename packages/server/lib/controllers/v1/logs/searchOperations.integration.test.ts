import { logContextGetter, migrateMapping } from '@nangohq/logs';
import { multipleMigrations, seeders } from '@nangohq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;
describe('POST /logs/operations', () => {
    beforeAll(async () => {
        await multipleMigrations();
        await migrateMapping();

        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        // @ts-expect-error missing body on purpose
        const res = await api.fetch('/api/v1/logs/operations', { method: 'POST', query: { env: 'dev' } });

        shouldBeProtected(res);
    });

    it('should enforce env query params', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        // @ts-expect-error missing query on purpose
        const res = await api.fetch('/api/v1/logs/operations', { method: 'POST', token: env.secret_key });

        shouldRequireQueryEnv(res);
    });

    it('should validate body', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch('/api/v1/logs/operations', {
            method: 'POST',
            query: { env: 'dev' },
            token: env.secret_key,
            // @ts-expect-error on purpose
            body: { limit: 'a', foo: 'bar' }
        });

        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_body',
                errors: [
                    {
                        code: 'invalid_type',
                        message: 'Expected number, received string',
                        path: ['limit']
                    },
                    {
                        code: 'unrecognized_keys',
                        message: "Unrecognized key(s) in object: 'foo'",
                        path: []
                    }
                ]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should search logs and get empty results', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch('/api/v1/logs/operations', {
            method: 'POST',
            query: { env: 'dev' },
            token: env.secret_key,
            body: { limit: 10 }
        });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual({
            data: [],
            pagination: { total: 0 }
        });
    });

    it('should search logs and get one result', async () => {
        const { env, account } = await seeders.seedAccountEnvAndUser();

        const logCtx = await logContextGetter.create({ message: 'test 1', operation: { type: 'auth', action: 'connect' } }, { account, environment: env });
        await logCtx.info('test info');
        await logCtx.success();

        const res = await api.fetch('/api/v1/logs/operations', {
            method: 'POST',
            query: { env: 'dev' },
            token: env.secret_key,
            body: { limit: 10 }
        });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: [
                {
                    accountId: env.account_id,
                    accountName: null,
                    code: null,
                    configId: null,
                    configName: null,
                    providerName: null,
                    connectionId: null,
                    connectionName: null,
                    createdAt: expect.toBeIsoDate(),
                    endedAt: expect.toBeIsoDate(),
                    environmentId: env.id,
                    environmentName: 'dev',
                    error: null,
                    id: logCtx.id,
                    jobId: null,
                    level: 'info',
                    message: 'test 1',
                    meta: null,
                    operation: {
                        type: 'auth',
                        action: 'connect'
                    },
                    parentId: null,
                    request: null,
                    response: null,
                    source: 'internal',
                    startedAt: expect.toBeIsoDate(),
                    state: 'success',
                    syncConfigId: null,
                    syncConfigName: null,
                    title: null,
                    type: 'log',
                    updatedAt: expect.toBeIsoDate(),
                    userId: null
                }
            ],
            pagination: { total: 1 }
        });
    });

    it('should search logs and not return results from an other account', async () => {
        const { account, env } = await seeders.seedAccountEnvAndUser();
        const env2 = await seeders.seedAccountEnvAndUser();

        const logCtx = await logContextGetter.create({ message: 'test 1', operation: { type: 'auth', action: 'connect' } }, { account, environment: env });
        await logCtx.info('test info');
        await logCtx.success();

        const res = await api.fetch('/api/v1/logs/operations', {
            method: 'POST',
            query: { env: 'dev' },
            token: env2.env.secret_key,
            body: { limit: 10 }
        });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: [],
            pagination: { total: 0 }
        });
    });
});
