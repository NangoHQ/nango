import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { seeders, updatePlan } from '@nangohq/shared';
import { roles } from '@nangohq/utils';

import { envs } from '../../../env.js';
import { authenticateUser, isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../utils/tests.js';

import type { DBInvitation } from '@nangohq/types';

const route = '/api/v1/invite';
const nonDefaultRole = roles.find((role) => role !== envs.DEFAULT_USER_ROLE);

if (!nonDefaultRole) {
    throw new Error('Expected a non-default role for invite tests');
}

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
        const { secret } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'POST',
            token: secret.secret,
            body: { emails: [] },
            // @ts-expect-error missing query on purpose
            query: {}
        });

        shouldRequireQueryEnv(res);
    });

    it('should validate body', async () => {
        const { secret } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'POST',
            query: { env: 'dev' },
            token: secret.secret,
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
            body: { emails: [email], role: nonDefaultRole },
            session
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);

        const invitation = await db.knex
            .select('*')
            .from<DBInvitation>('_nango_invited_users')
            .where({ email, account_id: account.id, accepted: false })
            .first();
        expect(invitation?.role).toBe(nonDefaultRole);
    });

    it('should reject invite with a non-default role when has_rbac is false', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const res = await api.fetch(route, {
            method: 'POST',
            query: { env: 'dev' },
            body: { emails: ['blocked@example.com'], role: nonDefaultRole },
            session
        });

        expect(res.res.status).toBe(403);
        expect((res.json as any).error.code).toBe('feature_disabled');
    });

    it('should allow invite without role when has_rbac is false (defaults to DEFAULT_USER_ROLE)', async () => {
        const { account, user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const email = 'default-role@example.com';
        const res = await api.fetch(route, {
            method: 'POST',
            query: { env: 'dev' },
            body: { emails: [email] },
            session
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);

        const invitation = await db.knex
            .select('*')
            .from<DBInvitation>('_nango_invited_users')
            .where({ email, account_id: account.id, accepted: false })
            .first();
        expect(invitation?.role).toBe(envs.DEFAULT_USER_ROLE);
    });
});
