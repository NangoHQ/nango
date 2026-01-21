import { environmentService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { GetEnvironments } from '@nangohq/types';

export const getEnvironments = asyncWrapper<GetEnvironments>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const accountId = res.locals.account.id;
    const environments = await environmentService.getEnvironmentsByAccountId(accountId);

    res.status(200).send({
        data: environments.map((env) => {
            return { name: env.name };
        })
    });
});
