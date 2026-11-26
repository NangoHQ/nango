import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';

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
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        // @ts-expect-error missing query on purpose
        const res = await api.fetch('/api/v1/logs/messages', { method: 'POST', token: apiKey.secret, body: { operationId: '1' } });

        shouldRequireQueryEnv(res);
    });

    it('should validate body', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch('/api/v1/logs/messages', {
            method: 'POST',
            query: { env: 'dev' },
            token: apiKey.secret,
            // @ts-expect-error on purpose
            body: { limit: 'a', foo: 'bar' }
        });

        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_body',
                errors: [
                    {
                        code: 'invalid_type',
                        message: 'Invalid input: expected string, received undefined',
                        path: ['operationId']
                    },
                    {
                        code: 'invalid_type',
                        message: 'Invalid input: expected number, received string',
                        path: ['limit']
                    },
                    {
                        code: 'unrecognized_keys',
                        message: 'Unrecognized key: "foo"',
                        path: []
                    }
                ]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should search messages and get empty results', async () => {
        const { account, env, apiKey } = await seeders.seedAccountEnvAndUser();

        const logCtx = await logContextGetter.create({ operation: { type: 'proxy', action: 'call' } }, { account, environment: env });
        await logCtx.success();

        const res = await api.fetch('/api/v1/logs/messages', {
            method: 'POST',
            query: { env: 'dev' },
            token: apiKey.secret,
            body: { operationId: logCtx.id, limit: 10 }
        });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: [],
            pagination: { total: 0, cursorAfter: null, cursorBefore: null },
            levelCounts: { debug: 0, info: 0, warn: 0, error: 0 }
        });
    });

    it('should search messages and get one result', async () => {
        const { env, account, apiKey } = await seeders.seedAccountEnvAndUser();

        const logCtx = await logContextGetter.create({ operation: { type: 'proxy', action: 'call' } }, { account, environment: env });
        await logCtx.info('test info');
        await logCtx.success();

        const res = await api.fetch('/api/v1/logs/messages', {
            method: 'POST',
            query: { env: 'dev' },
            token: apiKey.secret,
            body: { operationId: logCtx.id, limit: 10 }
        });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: [
                {
                    createdAt: expect.toBeIsoDate(),
                    id: expect.any(String),
                    accountId: account.id,
                    level: 'info',
                    message: 'test info',
                    parentId: logCtx.id,
                    source: 'internal',
                    type: 'log'
                }
            ],
            pagination: { total: 1, cursorBefore: expect.any(String), cursorAfter: expect.any(String) },
            levelCounts: { debug: 0, info: 1, warn: 0, error: 0 }
        });
    });

    it('should filter messages by level and still count every level', async () => {
        const { env, account, apiKey } = await seeders.seedAccountEnvAndUser();

        const logCtx = await logContextGetter.create({ operation: { type: 'proxy', action: 'call' } }, { account, environment: env });
        await logCtx.info('test info');
        await logCtx.error('test error');
        await logCtx.success();

        const res = await api.fetch('/api/v1/logs/messages', {
            method: 'POST',
            query: { env: 'dev' },
            token: apiKey.secret,
            body: { operationId: logCtx.id, limit: 10, levels: ['error'] }
        });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json.data.map((row) => row.message)).toStrictEqual(['test error']);
        expect(res.json.pagination.total).toBe(1);
        expect(res.json.levelCounts).toStrictEqual({ debug: 0, info: 1, warn: 0, error: 1 });
    });

    it('should not count levels on later pages', async () => {
        const { env, account, apiKey } = await seeders.seedAccountEnvAndUser();

        const logCtx = await logContextGetter.create({ operation: { type: 'proxy', action: 'call' } }, { account, environment: env });
        await logCtx.info('test info 1');
        await logCtx.info('test info 2');
        await logCtx.success();

        const first = await api.fetch('/api/v1/logs/messages', {
            method: 'POST',
            query: { env: 'dev' },
            token: apiKey.secret,
            body: { operationId: logCtx.id, limit: 1 }
        });
        isSuccess(first.json);
        expect(first.json.levelCounts).toStrictEqual({ debug: 0, info: 2, warn: 0, error: 0 });

        const next = await api.fetch('/api/v1/logs/messages', {
            method: 'POST',
            query: { env: 'dev' },
            token: apiKey.secret,
            body: { operationId: logCtx.id, limit: 1, cursorAfter: first.json.pagination.cursorAfter }
        });
        isSuccess(next.json);
        expect(next.json.data).toHaveLength(1);
        expect(next.json.levelCounts).toBeUndefined();

        const end = await api.fetch('/api/v1/logs/messages', {
            method: 'POST',
            query: { env: 'dev' },
            token: apiKey.secret,
            body: { operationId: logCtx.id, limit: 1, cursorAfter: next.json.pagination.cursorAfter }
        });
        isSuccess(end.json);
        expect(end.json.data).toHaveLength(0);
        expect(end.json.pagination.cursorAfter).toBeNull();
    });

    it('should list oldest first and page forward, counting levels on every page', async () => {
        const { env, account, apiKey } = await seeders.seedAccountEnvAndUser();

        const logCtx = await logContextGetter.create({ operation: { type: 'proxy', action: 'call' } }, { account, environment: env });
        await logCtx.info('first');
        await new Promise((resolve) => setTimeout(resolve, 5));
        await logCtx.info('second');
        await logCtx.success();

        const first = await api.fetch('/api/v1/logs/messages', {
            method: 'POST',
            query: { env: 'dev' },
            token: apiKey.secret,
            body: { operationId: logCtx.id, limit: 1, order: 'asc' }
        });
        isSuccess(first.json);
        expect(first.json.data.map((row) => row.message)).toStrictEqual(['first']);

        const next = await api.fetch('/api/v1/logs/messages', {
            method: 'POST',
            query: { env: 'dev' },
            token: apiKey.secret,
            body: { operationId: logCtx.id, limit: 1, order: 'asc', cursorAfter: first.json.pagination.cursorAfter }
        });
        isSuccess(next.json);
        expect(next.json.data.map((row) => row.message)).toStrictEqual(['second']);
        expect(next.json.levelCounts).toStrictEqual({ debug: 0, info: 2, warn: 0, error: 0 });

        const end = await api.fetch('/api/v1/logs/messages', {
            method: 'POST',
            query: { env: 'dev' },
            token: apiKey.secret,
            body: { operationId: logCtx.id, limit: 1, order: 'asc', cursorAfter: next.json.pagination.cursorAfter }
        });
        isSuccess(end.json);
        expect(end.json.data).toHaveLength(0);
        expect(end.json.pagination.cursorAfter).toBe(next.json.pagination.cursorAfter);
    });

    it('should reject an empty level filter', async () => {
        const { env, account, apiKey } = await seeders.seedAccountEnvAndUser();

        const logCtx = await logContextGetter.create({ operation: { type: 'proxy', action: 'call' } }, { account, environment: env });
        await logCtx.success();

        const res = await api.fetch('/api/v1/logs/messages', {
            method: 'POST',
            query: { env: 'dev' },
            token: apiKey.secret,
            body: { operationId: logCtx.id, levels: [] }
        });

        expect(res.res.status).toBe(400);
        expect(res.json).toMatchObject({ error: { code: 'invalid_body', errors: [{ path: ['levels'] }] } });
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
            token: env2.apiKey.secret,
            body: { operationId: logCtx.id, limit: 10 }
        });

        isError(res.json);
        expect(res.res.status).toBe(404);
        expect(res.json).toStrictEqual<typeof res.json>({ error: { code: 'not_found' } });
    });
});
