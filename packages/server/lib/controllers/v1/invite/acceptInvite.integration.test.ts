import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { inviteEmail, seeders, updatePlan, userService } from '@nangohq/shared';
import { roles } from '@nangohq/utils';

import { envs } from '../../../env.js';
import { authenticateUser, isSuccess, runServer, shouldBeProtected } from '../../../utils/tests.js';

import type { DBInvitation } from '@nangohq/types';

const route = '/api/v1/invite/:id';
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
        // @ts-expect-error duplicate GET/POST path confuses api.fetch endpoint inference
        const res = await api.fetch(route, { method: 'POST', params: { id: crypto.randomUUID() } });

        shouldBeProtected(res);
    });

    it('should overwrite the invited role when RBAC is disabled at acceptance time', async () => {
        const inviter = await seeders.seedAccountEnvAndUser();
        const invitee = await seeders.seedAccountEnvAndUser();

        await updatePlan(db.knex, { id: inviter.plan.id, has_rbac: true });

        const invitation = await db.knex.transaction(async (trx) => {
            return await inviteEmail({
                email: invitee.user.email,
                name: invitee.user.name,
                accountId: inviter.account.id,
                invitedByUserId: inviter.user.id,
                role: nonDefaultRole,
                trx
            });
        });

        if (!invitation) {
            throw new Error('Failed to create invitation');
        }

        await updatePlan(db.knex, { id: inviter.plan.id, has_rbac: false });

        const session = await authenticateUser(api, invitee.user);
        // @ts-expect-error duplicate GET/POST path confuses api.fetch endpoint inference
        const res = await api.fetch(route, { method: 'POST', params: { id: invitation.token }, session });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json).toStrictEqual({ data: { success: true } });

        const updatedUser = await userService.getUserById(invitee.user.id);
        expect(updatedUser?.account_id).toBe(inviter.account.id);
        expect(updatedUser?.role).toBe(envs.DEFAULT_USER_ROLE);

        const acceptedInvitation = await db.knex.select('*').from<DBInvitation>('_nango_invited_users').where({ id: invitation.id }).first();

        expect(acceptedInvitation?.accepted).toBe(true);
        expect(acceptedInvitation?.role).toBe(nonDefaultRole);
    });
});
