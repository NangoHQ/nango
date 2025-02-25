import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isError, isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;
describe('POST /logs/messages', () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch('/api/v1/logs/messages', { method: 'POST', query: { env: 'dev' }, body: { operationId: '1' } });

        shouldBeProtected(res);
    });

    it('should enforce env query params', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        // @ts-expect-error missing query on purpose
        const res = await api.fetch('/api/v1/logs/messages', { method: 'POST', token: env.secret_key, body: { operationId: '1' } });

        shouldRequireQueryEnv(res);
    });

    it('should validate body', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch('/api/v1/logs/messages', {
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
                        message: 'Required',
                        path: ['operationId']
                    },
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

    it('should search messages and get empty results', async () => {
        const { account, env } = await seeders.seedAccountEnvAndUser();

        const logCtx = await logContextGetter.create({ operation: { type: 'proxy', action: 'call' } }, { account, environment: env });
        await logCtx.success();

        const res = await api.fetch('/api/v1/logs/messages', {
            method: 'POST',
            query: { env: 'dev' },
            token: env.secret_key,
            body: { operationId: logCtx.id, limit: 10 }
        });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: [],
            pagination: { total: 0, cursorAfter: null, cursorBefore: null }
        });
    });

    it('should search messages and get one result', async () => {
        const { env, account } = await seeders.seedAccountEnvAndUser();

        const logCtx = await logContextGetter.create({ operation: { type: 'proxy', action: 'call' } }, { account, environment: env });
        await logCtx.info('test info');
        await logCtx.success();

        const res = await api.fetch('/api/v1/logs/messages', {
            method: 'POST',
            query: { env: 'dev' },
            token: env.secret_key,
            body: { operationId: logCtx.id, limit: 10 }
        });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: [
                {
                    createdAt: expect.toBeIsoDate(),
                    id: expect.any(String),
                    level: 'info',
                    message: 'test info',
                    parentId: logCtx.id,
                    source: 'internal',
                    type: 'log'
                }
            ],
            pagination: { total: 1, cursorBefore: expect.any(String), cursorAfter: null }
        });
    });

    it('should search messages and not return results from an other account', async () => {
        const { account, env } = await seeders.seedAccountEnvAndUser();
        const env2 = await seeders.seedAccountEnvAndUser();

        const logCtx = await logContextGetter.create({ operation: { type: 'proxy', action: 'call' } }, { account, environment: env });
        await logCtx.info('test info');
        await logCtx.success();

        const res = await api.fetch('/api/v1/logs/messages', {
            method: 'POST',
            query: { env: 'dev' },
            token: env2.env.secret_key,
            body: { operationId: logCtx.id, limit: 10 }
        });

        isError(res.json);
        expect(res.res.status).toBe(404);
        expect(res.json).toStrictEqual<typeof res.json>({ error: { code: 'not_found' } });
    });
});
