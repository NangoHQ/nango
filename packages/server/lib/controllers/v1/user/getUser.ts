import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { buildPermissions } from '../../../authz/resolve.js';
import { userToAPI } from '../../../formatters/user.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { GetUser } from '@nangohq/types';

export const getUser = asyncWrapper<GetUser>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { plan, user } = res.locals;
    res.status(200).send({
        data: { ...userToAPI(user), role: user.role, permissions: await buildPermissions(user.role, plan) }
    });
});
