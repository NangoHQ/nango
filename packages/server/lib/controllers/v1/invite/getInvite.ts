import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { GetInvite } from '@nangohq/types';
import { accountService, getInvitation, userService } from '@nangohq/shared';
import { z } from 'zod';
import { userToAPI } from '../../../formatters/user.js';
import { teamToApi } from '../../../formatters/team.js';
import { invitationToApi } from '../../../formatters/invitation.js';

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
            error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) }
        });
        return;
    }

    const data: GetInvite['Params'] = val.data;
    const invitation = await getInvitation(data.id);
    if (!invitation) {
        res.status(400).send({ error: { code: 'not_found', message: 'Invitation does not exists or is expired' } });
        return;
    }

    const invitedBy = await userService.getUserById(invitation.invited_by);
    if (!invitedBy) {
        res.status(400).send({ error: { code: 'server_error', message: 'Failed to find inviter' } });
        return;
    }

    const newTeam = await accountService.getAccountById(invitation.account_id);
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
