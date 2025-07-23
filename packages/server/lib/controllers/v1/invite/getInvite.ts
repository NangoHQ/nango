import * as z from 'zod';

import db from '@nangohq/database';
import { accountService, getInvitation, userService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { invitationToApi } from '../../../formatters/invitation.js';
import { teamToApi } from '../../../formatters/team.js';
import { userToAPI } from '../../../formatters/user.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { GetInvite } from '@nangohq/types';

const validation = z
    .object({
        id: z.string().uuid()
    })
    .strict();

export const getInvite = asyncWrapper<GetInvite>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = validation.safeParse(req.params);
    if (!val.success) {
        res.status(400).send({
            error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(val.error) }
        });
        return;
    }

    const data: GetInvite['Params'] = val.data;
    const invitation = await getInvitation(data.id);
    if (!invitation) {
        res.status(400).send({ error: { code: 'not_found', message: 'Invitation does not exist or is expired' } });
        return;
    }

    const invitedBy = await userService.getUserById(invitation.invited_by);
    if (!invitedBy) {
        res.status(400).send({ error: { code: 'server_error', message: 'Failed to find inviter' } });
        return;
    }

    const newTeam = await accountService.getAccountById(db.knex, invitation.account_id);
    if (!newTeam) {
        res.status(400).send({ error: { code: 'server_error', message: 'Failed to find new team' } });
        return;
    }

    const total = await userService.countUsers(invitation.account_id);

    res.status(200).send({
        data: {
            invitedBy: userToAPI(invitedBy),
            invitation: invitationToApi(invitation),
            newTeam: teamToApi(newTeam),
            newTeamUsers: total
        }
    });
});
