import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { GetTeam } from '@nangohq/types';
import { NANGO_ADMIN_UUID } from '../../account.controller.js';
import { listInvitations, userService } from '@nangohq/shared';
import { userToAPI } from '../../../formatters/user.js';
import { invitationToApi } from '../../../formatters/invitation.js';
import { teamToApi } from '../../../formatters/team.js';

export const getTeam = asyncWrapper<GetTeam>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { account } = res.locals;

    const users = await userService.getUsersByAccountId(account.id);
    const invitedUsers = await listInvitations({ accountId: account.id });

    const usersFormatted = users.map(userToAPI);

    res.status(200).send({
        data: {
            account: teamToApi(account),
            users: usersFormatted,
            invitedUsers: invitedUsers.map(invitationToApi),
            isAdminTeam: account.uuid === NANGO_ADMIN_UUID
        }
    });
});
