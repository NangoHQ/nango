import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { validation } from './validation.js';

import type { PostFunctionDeploy } from '@nangohq/types';

export const postFunctionDeploy = asyncWrapper<PostFunctionDeploy>((req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = validation.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) } });
        return;
    }

    res.status(501).send({ error: { code: 'not_implemented', message: 'Function deployment is not implemented yet' } });
});
