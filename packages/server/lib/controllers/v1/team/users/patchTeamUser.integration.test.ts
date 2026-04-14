import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { seeders, updatePlan, userService } from '@nangohq/shared';

import { authenticateUser, isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../../utils/tests.js';

const route = '/api/v1/team/users/:id';
let api: Awaited<ReturnType<typeof runServer>>;

describe(`PATCH ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, {
            method: 'PATCH',
            query: { env: 'dev' },
            params: { id: 1 },
            body: { role: 'production_support' }
        });

        shouldBeProtected(res);
    });

    it('should enforce env query params', async () => {
        const { secret } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'PATCH',
            token: secret.secret,
            params: { id: 1 },
            body: { role: 'production_support' },
            // @ts-expect-error missing query on purpose
            query: {}
        });

        shouldRequireQueryEnv(res);
    });

    it('should validate body', async () => {
        const { secret } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'PATCH',
            query: { env: 'dev' },
            token: secret.secret,
            params: { id: 1 },
            // @ts-expect-error invalid role on purpose
            body: { role: 'invalid_role' }
        });

        expect(res.res.status).toBe(400);
        expect((res.json as any).error.code).toBe('invalid_body');
    });

    it('should change a user role', async () => {
        const { account, user, plan } = await seeders.seedAccountEnvAndUser();
        await updatePlan(db.knex, { id: plan.id, has_rbac: true });
        const targetUser = await seeders.seedUser(account.id);
        const session = await authenticateUser(api, user);

        const res = await api.fetch(route, {
            method: 'PATCH',
            query: { env: 'dev' },
            params: { id: targetUser.id },
            body: { role: 'production_support' },
            session
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);

        const updated = await userService.getUserById(targetUser.id);
        expect(updated?.role).toBe('production_support');
    });

    it('should prevent self-demotion', async () => {
        const { user, plan } = await seeders.seedAccountEnvAndUser();
        await updatePlan(db.knex, { id: plan.id, has_rbac: true });
        const session = await authenticateUser(api, user);

        const res = await api.fetch(route, {
            method: 'PATCH',
            query: { env: 'dev' },
            params: { id: user.id },
            body: { role: 'production_support' },
            session
        });

        expect(res.res.status).toBe(400);
        expect((res.json as any).error.code).toBe('forbidden_self_demotion');
    });

    it('should return user_not_found for user in different account', async () => {
        const { user, plan } = await seeders.seedAccountEnvAndUser();
        await updatePlan(db.knex, { id: plan.id, has_rbac: true });
        const { user: otherUser } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const res = await api.fetch(route, {
            method: 'PATCH',
            query: { env: 'dev' },
            params: { id: otherUser.id },
            body: { role: 'production_support' },
            session
        });

        expect(res.res.status).toBe(400);
        expect((res.json as any).error.code).toBe('user_not_found');
    });

    it('should reject non-administrator role when has_rbac is false', async () => {
        const { account, user } = await seeders.seedAccountEnvAndUser();
        const targetUser = await seeders.seedUser(account.id);
        const session = await authenticateUser(api, user);

        const res = await api.fetch(route, {
            method: 'PATCH',
            query: { env: 'dev' },
            params: { id: targetUser.id },
            body: { role: 'production_support' },
            session
        });

        expect(res.res.status).toBe(403);
        expect((res.json as any).error.code).toBe('feature_disabled');

        const notUpdated = await userService.getUserById(targetUser.id);
        expect(notUpdated?.role).toBe('administrator');
    });

    it('should allow setting administrator role even when has_rbac is false', async () => {
        const { account, user } = await seeders.seedAccountEnvAndUser();
        const targetUser = await seeders.seedUser(account.id);
        const session = await authenticateUser(api, user);

        const res = await api.fetch(route, {
            method: 'PATCH',
            query: { env: 'dev' },
            params: { id: targetUser.id },
            body: { role: 'administrator' },
            session
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
    });
});
