import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { buildPermissions } from '../../../authz/permissions.js';
import { userToAPI } from '../../../formatters/user.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { DBUser, GetUser } from '@nangohq/types';

export const getUser = asyncWrapper<GetUser, never>((req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const user = res.locals['user'] as DBUser;
    res.status(200).send({
        data: { ...userToAPI(user), role: user.role, permissions: buildPermissions(user.role) }
    });
});
