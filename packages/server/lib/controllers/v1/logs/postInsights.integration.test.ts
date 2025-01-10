import { seeders } from '@nangohq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;
describe('POST /logs/insights', () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch('/api/v1/logs/insights', { method: 'POST', query: { env: 'dev' }, body: { type: 'action' } });

        shouldBeProtected(res);
    });

    it('should enforce env query params', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(
            '/api/v1/logs/insights',
            // @ts-expect-error missing query on purpose
            {
                method: 'POST',
                token: env.secret_key,
                body: { type: 'action' }
            }
        );

        shouldRequireQueryEnv(res);
    });

    it('should validate body', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch('/api/v1/logs/insights', {
            method: 'POST',
            query: {
                env: 'dev',
                // @ts-expect-error on purpose
                foo: 'bar'
            },
            token: env.secret_key,
            body: {
                // @ts-expect-error on purpose
                type: 'foobar'
            }
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
        const res = await api.fetch('/api/v1/logs/insights', {
            method: 'POST',
            query: { env: 'dev' },
            token: env.secret_key,
            body: { type: 'sync:run' }
        });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: {
                histogram: []
            }
        });
    });
});
