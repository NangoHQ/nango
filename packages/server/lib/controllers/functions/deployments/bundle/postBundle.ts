import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { validation } from './validation.js';

import type { PostFunctionDeploymentBundle } from '@nangohq/types';

/**
 * Deploy a set of functions for a given environment (and potentialluy integration)
 * Each function contains its own config and compiled code.
 */
export const postFunctionDeploymentBundle = asyncWrapper<PostFunctionDeploymentBundle>((req, res) => {
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
