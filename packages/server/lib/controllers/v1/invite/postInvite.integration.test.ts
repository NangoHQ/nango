import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { seeders, updatePlan } from '@nangohq/shared';

import { authenticateUser, isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../utils/tests.js';

import type { DBInvitation } from '@nangohq/types';

const route = '/api/v1/invite';
const nonAdminRole = 'production_support';

let api: Awaited<ReturnType<typeof runServer>>;
describe(`POST ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, { method: 'POST', query: { env: 'dev' }, body: { emails: [] } });

        shouldBeProtected(res);
    });

    it('should enforce env query params', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'POST',
            token: apiKey.secret,
            body: { emails: [] },
            // @ts-expect-error missing query on purpose
            query: {}
        });

        shouldRequireQueryEnv(res);
    });

    it('should validate body', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'POST',
            query: { env: 'dev' },
            token: apiKey.secret,
            // @ts-expect-error on purpose
            body: { emails: 1 }
        });

        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_body',
                errors: [{ code: 'invalid_type', message: 'Invalid input: expected array, received number', path: ['emails'] }]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should invite a user', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const res = await api.fetch(route, {
            method: 'POST',
            query: { env: 'dev' },
            body: { emails: ['foo@example.com'] },
            session
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json).toMatchObject({
            data: {
                invited: ['foo@example.com']
            }
        });
    });

    it('should invite a user with a specific role', async () => {
        const { account, user, plan } = await seeders.seedAccountEnvAndUser();
        await updatePlan(db.knex, { id: plan.id, has_rbac: true });
        const session = await authenticateUser(api, user);

        const email = 'role-test@example.com';
        const res = await api.fetch(route, {
            method: 'POST',
            query: { env: 'dev' },
            body: { emails: [email], role: nonAdminRole },
            session
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);

        const invitation = await db.knex
            .select('*')
            .from<DBInvitation>('_nango_invited_users')
            .where({ email, account_id: account.id, accepted: false })
            .first();
        expect(invitation?.role).toBe(nonAdminRole);
    });

    it('should reject invite with a non-administrator role when has_rbac is false', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const res = await api.fetch(route, {
            method: 'POST',
            query: { env: 'dev' },
            body: { emails: ['blocked@example.com'], role: nonAdminRole },
            session
        });

        expect(res.res.status).toBe(403);
        expect((res.json as any).error.code).toBe('feature_disabled');
    });

    it('should allow invite with administrator role when has_rbac is false', async () => {
        const { account, user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const email = 'admin-role@example.com';
        const res = await api.fetch(route, {
            method: 'POST',
            query: { env: 'dev' },
            body: { emails: [email], role: 'administrator' },
            session
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);

        const invitation = await db.knex
            .select('*')
            .from<DBInvitation>('_nango_invited_users')
            .where({ email, account_id: account.id, accepted: false })
            .first();
        expect(invitation?.role).toBe('administrator');
    });
});
