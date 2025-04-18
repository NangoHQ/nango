import type { GetUser } from '@nangohq/types';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { userToAPI } from '../../../formatters/user.js';

export const getUser = asyncWrapper<GetUser, never>((req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    res.status(200).send({
        data: userToAPI(res.locals['user'])
    });
});
