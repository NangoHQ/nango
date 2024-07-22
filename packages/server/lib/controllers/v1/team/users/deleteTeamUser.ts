import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { requireEmptyBody, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { DeleteTeamUser } from '@nangohq/types';
import { accountService, userService } from '@nangohq/shared';
import { z } from 'zod';

const validation = z
    .object({
        id: z.coerce.number()
    })
    .strict();

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

    const user = await userService.getUserById(params.id);
    if (!user || user.account_id !== account.id) {
        res.status(400).send({ error: { code: 'user_not_found' } });
        return;
    }
    if (user.email === me.email) {
        res.status(400).send({ error: { code: 'forbidden_self_delete', message: "You can't remove yourself from a team" } });
        return;
    }

    // Account ID is not nullable until we change the way we deal with default account so we create a temp one
    const newTeam = await accountService.createAccount(`${user.name}'s Organization`);
    if (!newTeam) {
        res.status(500).send({ error: { code: 'server_error' } });
        return;
    }

    const updated = await userService.update({ id: user.id, account_id: newTeam.id });
    if (!updated) {
        res.status(500).send({ error: { code: 'server_error', message: 'failed to update user team' } });
        return;
    }

    // TODO: destroy this user session to avoid desync
    // TODO: last user removed from a team should (soft) delete the team

    res.status(200).send({
        data: { success: true }
    });
});
