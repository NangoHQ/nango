import * as z from 'zod';

import db from '@nangohq/database';
import { accountService, userService } from '@nangohq/shared';
import { getLogger, requireEmptyBody, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { deleteUserSessions } from '../../../../clients/auth.client.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { DeleteTeamUser } from '@nangohq/types';

const validation = z
    .object({
        id: z.coerce.number()
    })
    .strict();

const logger = getLogger('DeleteTeamUser');

export const deleteTeamUser = asyncWrapper<DeleteTeamUser>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const emptyBody = requireEmptyBody(req);
    if (emptyBody) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(emptyBody.error) } });
        return;
    }

    const val = validation.safeParse(req.params);
    if (!val.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(val.error) } });
        return;
    }

    const { account, user: me } = res.locals;
    const params: DeleteTeamUser['Params'] = val.data;

    const user = await userService.getUserByIdAndAccountId(params.id, account.id);
    if (!user) {
        res.status(400).send({ error: { code: 'user_not_found' } });
        return;
    }
    if (user.email === me.email) {
        res.status(400).send({ error: { code: 'forbidden_self_delete', message: "You can't remove yourself from a team" } });
        return;
    }

    // Account ID is not nullable until we change the way we deal with default account so we create a temp one
    const newTeam = await accountService.createAccount({ name: user.name });
    if (!newTeam) {
        res.status(500).send({ error: { code: 'server_error' } });
        return;
    }

    const updated = await db.knex.transaction(async (trx) => {
        const movedUser = await userService.update({ id: user.id, account_id: newTeam.id }, trx);
        if (!movedUser) {
            return null;
        }

        // Force re-authentication so the removed member does not keep using an old team-scoped session.
        await deleteUserSessions(user.id, { trx });

        return movedUser;
    });
    if (!updated) {
        res.status(500).send({ error: { code: 'server_error', message: 'failed to update user team' } });
        return;
    }

    const remainingUsers = await userService.countUsers(account.id);
    if (remainingUsers === 0) {
        logger.warning('team has no active users after member removal', {
            accountId: account.id,
            removedUserId: user.id
        });
    }

    res.status(200).send({
        data: { success: true }
    });
});
