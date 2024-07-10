import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { GetTeam, WebUser } from '@nangohq/types';
import { NANGO_ADMIN_UUID } from '../../account.controller.js';
import { userService } from '@nangohq/shared';

export const getTeam = asyncWrapper<GetTeam>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { account } = res.locals;

    const users = await userService.getUsersByAccountId(account.id);
    const invitedUsers = await userService.getInvitedUsersByAccountId(account.id);

    const usersFormatted: WebUser[] = users.map((teamUser) => {
        return {
            id: teamUser.id,
            accountId: teamUser.account_id,
            email: teamUser.email,
            name: teamUser.name
        };
    });

    res.status(200).send({
        data: {
            account: {
                ...account,
                created_at: account.created_at.toISOString(),
                updated_at: account.updated_at.toISOString()
            },
            users: usersFormatted,
            invitedUsers,
            isAdminTeam: account.uuid === NANGO_ADMIN_UUID
        }
    });
});
