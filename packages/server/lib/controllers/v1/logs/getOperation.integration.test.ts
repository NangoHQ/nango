import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;
describe('GET /logs/operations/:operationId', () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch('/api/v1/logs/operations/:operationId', { query: { env: 'dev' }, params: { operationId: '1' } });

        shouldBeProtected(res);
    });

    it('should enforce env query params', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(
            '/api/v1/logs/operations/:operationId',
            // @ts-expect-error missing query on purpose
            { token: env.secret_key, params: { operationId: '1' } }
        );

        shouldRequireQueryEnv(res);
    });

    it('should validate query params', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch('/api/v1/logs/operations/:operationId', {
            query: {
                env: 'dev',
                // @ts-expect-error on purpose
                foo: 'bar'
            },
            token: env.secret_key,
            params: { operationId: '1' }
        });

        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_query_params',
                errors: [
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

    it('should get empty result', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch('/api/v1/logs/operations/:operationId', {
            query: { env: 'dev' },
            token: env.secret_key,
            params: { operationId: '1741878251660_XQMgbkGG' }
        });

        expect(res.res.status).toBe(404);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'not_found' }
        });
    });

    it('should get one result', async () => {
        const { env, account } = await seeders.seedAccountEnvAndUser();

        const logCtx = await logContextGetter.create({ operation: { type: 'proxy', action: 'call' } }, { account, environment: env });
        await logCtx.info('test info');
        await logCtx.success();

        const res = await api.fetch(`/api/v1/logs/operations/:operationId`, {
            query: { env: 'dev' },
            token: env.secret_key,
            params: { operationId: logCtx.id }
        });

        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: {
                accountId: env.account_id,
                accountName: account.name,
                createdAt: expect.toBeIsoDate(),
                endedAt: expect.toBeIsoDate(),
                environmentId: env.id,
                environmentName: 'dev',
                expiresAt: expect.toBeIsoDate(),
                id: logCtx.id,
                level: 'info',
                message: 'Proxy',
                operation: {
                    type: 'proxy',
                    action: 'call'
                },
                source: 'internal',
                startedAt: expect.toBeIsoDate(),
                state: 'success',
                type: 'operation',
                updatedAt: expect.toBeIsoDate()
            }
        });
    });

    it('should not return result from an other account', async () => {
        const { account, env } = await seeders.seedAccountEnvAndUser();
        const env2 = await seeders.seedAccountEnvAndUser();

        const logCtx = await logContextGetter.create({ operation: { type: 'proxy', action: 'call' } }, { account, environment: env });
        await logCtx.info('test info');
        await logCtx.success();

        const res = await api.fetch(`/api/v1/logs/operations/:operationId`, {
            query: { env: 'dev' },
            token: env2.env.secret_key,
            params: { operationId: logCtx.id }
        });

        expect(res.res.status).toBe(404);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'not_found' }
        });
    });
});
