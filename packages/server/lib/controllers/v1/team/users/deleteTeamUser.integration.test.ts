import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seeders, userService } from '@nangohq/shared';

import { authenticateUser, isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../../utils/tests.js';

const route = '/api/v1/team/users/:id';
let api: Awaited<ReturnType<typeof runServer>>;
describe(`DELETE ${route}`, () => {
    beforeAll(async () => {
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
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'DELETE',
            token: apiKey.secret,
            params: { id: 1 },
            // @ts-expect-error missing query on purpose
            query: {}
        });

        shouldRequireQueryEnv(res);
    });

    it('should validate params', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'DELETE',
            query: { env: 'dev' },
            token: apiKey.secret,
            // @ts-expect-error on purpose
            params: { id: 'a' }
        });

        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_uri_params',
                errors: [{ code: 'invalid_type', message: 'Invalid input: expected number, received NaN', path: ['id'] }]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should delete team user and invalidate removed user sessions', async () => {
        const { account, user: adminUser } = await seeders.seedAccountEnvAndUser();
        const removedUser = await seeders.seedUser(account.id);

        const adminSession = await authenticateUser(api, adminUser);
        const removedUserSession = await authenticateUser(api, removedUser);

        const listBefore = await api.fetch('/api/v1/team', {
            method: 'GET',
            query: { env: 'dev' },
            session: adminSession
        });
        isSuccess(listBefore.json);
        expect(listBefore.json.data.users).toHaveLength(2);

        const removal = await api.fetch(route, {
            method: 'DELETE',
            query: { env: 'dev' },
            session: adminSession,
            params: { id: removedUser.id }
        });

        expect(removal.res.status).toBe(200);
        isSuccess(removal.json);
        expect(removal.json).toStrictEqual<typeof removal.json>({ data: { success: true } });

        const movedUser = await userService.getUserById(removedUser.id);
        expect(movedUser?.account_id).not.toBe(account.id);

        const removedUserSelf = await api.fetch('/api/v1/user', {
            method: 'GET',
            session: removedUserSession
        });
        expect(removedUserSelf.res.status).toBe(401);

        const listAfter = await api.fetch('/api/v1/team', {
            method: 'GET',
            query: { env: 'dev' },
            session: adminSession
        });
        isSuccess(listAfter.json);
        expect(listAfter.json.data.users).toHaveLength(1);
        expect(listAfter.json.data.users.map((u) => u.id)).toStrictEqual([adminUser.id]);
    });
});
