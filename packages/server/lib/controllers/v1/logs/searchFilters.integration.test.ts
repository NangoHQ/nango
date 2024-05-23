import { logContextGetter, migrateMapping } from '@nangohq/logs';
import { multipleMigrations, seeders } from '@nangohq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;
describe('POST /logs/filters', () => {
    beforeAll(async () => {
        await multipleMigrations();
        await migrateMapping();

        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch('/api/v1/logs/filters', { method: 'POST', query: { env: 'dev' }, body: { category: 'config', search: '' } });

        shouldBeProtected(res);
    });

    it('should enforce env query params', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        // @ts-expect-error missing query on purpose
        const res = await api.fetch('/api/v1/logs/filters', { method: 'POST', token: env.secret_key, body: { category: 'config' } });

        shouldRequireQueryEnv(res);
    });

    it('should validate body', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch('/api/v1/logs/filters', {
            method: 'POST',
            query: { env: 'dev' },
            token: env.secret_key,
            // @ts-expect-error on purpose
            body: { category: 'a', foo: 'bar' }
        });

        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_body',
                errors: [
                    {
                        code: 'invalid_enum_value',
                        message: "Invalid enum value. Expected 'config' | 'connection' | 'syncConfig', received 'a'",
                        path: ['category']
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

    it('should search filters and get empty results', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch('/api/v1/logs/filters', {
            method: 'POST',
            query: { env: 'dev' },
            token: env.secret_key,
            body: { category: 'config', search: '' }
        });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual({
            data: []
        });
    });

    it('should search filters and get one result', async () => {
        const { env, account } = await seeders.seedAccountEnvAndUser();

        const logCtx = await logContextGetter.create(
            { message: 'test 1', operation: { type: 'proxy' } },
            { account, environment: env, integration: { id: 1, name: 'hello', provider: 'github' } }
        );
        await logCtx.info('test info');
        await logCtx.success();

        const res = await api.fetch('/api/v1/logs/filters', {
            method: 'POST',
            query: { env: 'dev' },
            token: env.secret_key,
            body: { category: 'config', search: '' }
        });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: [{ key: 'hello', doc_count: 1 }]
        });
    });

    it('should search filters with a query and get one result', async () => {
        const { env, account } = await seeders.seedAccountEnvAndUser();

        const logCtx = await logContextGetter.create(
            { message: 'test 1', operation: { type: 'proxy' } },
            { account, environment: env, integration: { id: 1, name: 'hello', provider: 'github' } }
        );
        await logCtx.info('test info');
        await logCtx.success();

        const res = await api.fetch('/api/v1/logs/filters', {
            method: 'POST',
            query: { env: 'dev' },
            token: env.secret_key,
            body: { category: 'config', search: 'hel' }
        });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: [{ key: 'hello', doc_count: 1 }]
        });
    });

    it('should search messages and not return results from an other account', async () => {
        const { account, env } = await seeders.seedAccountEnvAndUser();
        const env2 = await seeders.seedAccountEnvAndUser();

        const logCtx = await logContextGetter.create(
            { message: 'test 1', operation: { type: 'proxy' } },
            { account, environment: env, integration: { id: 1, name: 'hello', provider: 'github' } }
        );
        await logCtx.info('test info');
        await logCtx.success();

        const res = await api.fetch('/api/v1/logs/filters', {
            method: 'POST',
            query: { env: 'dev' },
            token: env2.env.secret_key,
            body: { category: 'config', search: '' }
        });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: []
        });
    });
});
