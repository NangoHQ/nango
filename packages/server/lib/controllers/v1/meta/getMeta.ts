import { environmentService } from '@nangohq/shared';
import { NANGO_VERSION, baseUrl, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { GetMeta } from '@nangohq/types';

export const getMeta = asyncWrapper<GetMeta>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const sessionUser = res.locals.user;

    const environments = await environmentService.getEnvironmentsByAccountId(sessionUser.account_id);
    res.status(200).send({
        data: {
            environments: environments.map((env) => {
                return { name: env.name };
            }),
            version: NANGO_VERSION,
            baseUrl,
            debugMode: req.session.debugMode === true,
            gettingStartedClosed: sessionUser.closed_getting_started
        }
    });
});
