import * as z from 'zod';

import db from '@nangohq/database';
import { expirePreviousInvitations, inviteEmail, userService } from '@nangohq/shared';
import { requireEmptyQuery, roles, zodErrorToHTTP } from '@nangohq/utils';

import { envs } from '../../../env.js';
import { sendInviteEmail } from '../../../helpers/email.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { hasRbac } from '../../../utils/rbac.js';

import type { PostInvite } from '@nangohq/types';

const validation = z
    .object({
        emails: z.array(z.string().min(3).max(255).email()),
        role: z.enum(roles).optional()
    })
    .strict();

export const postInvite = asyncWrapper<PostInvite>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = validation.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({
            error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) }
        });
        return;
    }

    const { account, user, plan } = res.locals;
    const body = val.data;
    const effectiveRole = body.role ?? envs.DEFAULT_USER_ROLE;

    const hasRbacRes = await hasRbac({ accountId: account.id, plan });
    if (hasRbacRes.isErr()) {
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to check RBAC' } });
        return;
    }

    if (!hasRbacRes.value && effectiveRole !== 'administrator') {
        res.status(403).send({ error: { code: 'feature_disabled', message: 'Role-based access control requires a Growth plan or above' } });
        return;
    }

    const invited: string[] = [];
    for (const email of body.emails) {
        const existingUser = await userService.getUserByEmail(email);
        if (existingUser && existingUser.account_id === account.id) {
            continue;
        }

        const invitation = await db.knex.transaction(async (trx) => {
            await expirePreviousInvitations({ email, accountId: account.id, trx });

            return await inviteEmail({ email, name: email, accountId: account.id, invitedByUserId: user.id, role: effectiveRole, trx });
        });
        if (!invitation) {
            res.status(500).json({
                error: { code: 'server_error', message: `Failed to invite ${email}` }
            });
            return;
        }

        await sendInviteEmail({ email, account, user, invitation });
        invited.push(email);
    }

    res.status(200).send({
        data: { invited }
    });
});
