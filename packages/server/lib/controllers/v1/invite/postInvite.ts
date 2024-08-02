import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { PostInvite } from '@nangohq/types';
import { expirePreviousInvitations, inviteEmail, userService } from '@nangohq/shared';
import { z } from 'zod';
import { sendInviteEmail } from '../../../helpers/email.js';
import db from '@nangohq/database';

const validation = z
    .object({
        emails: z.array(z.string().min(3).max(255).email())
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

    const { account, user } = res.locals;
    const body: PostInvite['Body'] = val.data;

    const invited: string[] = [];
    for (const email of body.emails) {
        const existingUser = await userService.getUserByEmail(email);
        if (existingUser && existingUser.account_id === account.id) {
            continue;
        }

        const invitation = await db.knex.transaction(async (trx) => {
            await expirePreviousInvitations({ email, accountId: account.id, trx });

            return await inviteEmail({ email, name: email, accountId: account.id, invitedByUserId: user.id, trx });
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
