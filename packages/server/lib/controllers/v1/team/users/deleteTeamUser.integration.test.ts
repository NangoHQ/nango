import { multipleMigrations } from '@nangohq/database';
import { seeders } from '@nangohq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../../utils/tests.js';

const route = '/api/v1/team/users/:id';
let api: Awaited<ReturnType<typeof runServer>>;
describe(`DELETE ${route}`, () => {
    beforeAll(async () => {
        await multipleMigrations();
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, { method: 'DELETE', query: { env: 'dev' }, params: { id: 1 } });

        shouldBeProtected(res);
    });

    it('should enforce env query params', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'DELETE',
            token: env.secret_key,
            params: { id: 1 },
            // @ts-expect-error missing query on purpose
            query: {}
        });

        shouldRequireQueryEnv(res);
    });

    it('should validate params', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'DELETE',
            query: { env: 'dev' },
            token: env.secret_key,
            // @ts-expect-error on purpose
            params: { id: 'a' }
        });

        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_uri_params',
                errors: [{ code: 'invalid_type', message: 'Expected number, received nan', path: ['id'] }]
            }
        });
        expect(res.res.status).toBe(400);
    });

    // TODO: can't test stuff that needs `user` because we are using an anonymous secret_key
    // it('should delete team user', async () => {
    //     const { env } = await seeders.seedAccountEnvAndUser();
    //     const user2 = await seeders.seedUser(env.account_id);

    //     const listBefore = await api.fetch('/api/v1/team', { method: 'GET', query: { env: 'dev' }, token: env.secret_key });
    //     isSuccess(listBefore.json);
    //     expect(listBefore.json.data.users).toHaveLength(2);

    //     const res = await api.fetch(route, {
    //         method: 'DELETE',
    //         query: { env: 'dev' },
    //         token: env.secret_key,
    //         params: { id: user2.id }
    //     });

    //     expect(res.res.status).toBe(200);
    //     isSuccess(res.json);
    //     expect(res.json).toMatchObject<typeof res.json>({
    //         data: {
    //             success: true
    //         }
    //     });

    //     const listAfter = await api.fetch('/api/v1/team', { method: 'GET', query: { env: 'dev' }, token: env.secret_key });
    //     isSuccess(listAfter.json);
    //     expect(listAfter.json.data.users).toHaveLength(1);
    // });
});
