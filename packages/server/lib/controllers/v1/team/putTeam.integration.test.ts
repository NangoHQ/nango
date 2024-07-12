import { multipleMigrations } from '@nangohq/database';
import { seeders } from '@nangohq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../utils/tests.js';

const route = '/api/v1/team';
let api: Awaited<ReturnType<typeof runServer>>;
describe(`PUT ${route}`, () => {
    beforeAll(async () => {
        await multipleMigrations();
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, { method: 'PUT', query: { env: 'dev' }, body: { name: '' } });

        shouldBeProtected(res);
    });

    it('should enforce env query params', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(
            route,
            // @ts-expect-error missing query on purpose
            { token: env.secret_key, params: { operationId: '1' } }
        );

        shouldRequireQueryEnv(res);
    });

    it('should validate body', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'PUT',
            query: { env: 'dev' },
            token: env.secret_key,
            // @ts-expect-error on purpose
            body: { name: 1 }
        });

        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_body',
                errors: [{ code: 'invalid_type', message: 'Expected string, received number', path: ['name'] }]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should put team name', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(route, {
            method: 'PUT',
            query: { env: 'dev' },
            token: env.secret_key,
            body: { name: 'hello' }
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json).toMatchObject({
            data: {
                name: 'hello'
            }
        });
    });
});
