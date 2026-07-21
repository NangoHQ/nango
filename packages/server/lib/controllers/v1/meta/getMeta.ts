import { getFlags } from '@nangohq/feature-flags';
import { environmentService } from '@nangohq/shared';
import { baseUrl, NANGO_VERSION, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { GetMeta } from '@nangohq/types';

export const getMeta = asyncWrapper<GetMeta>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { user: sessionUser, account } = res.locals;

    const environments = await environmentService.getEnvironmentsByAccountId(sessionUser.account_id);
    res.status(200).send({
        data: {
            environments: environments.map((env) => {
                return { name: env.name, is_production: env.is_production };
            }),
            version: NANGO_VERSION,
            baseUrl,
            debugMode: req.session.debugMode === true,
            gettingStartedClosed: sessionUser.getting_started_closed,
            billingUsageSource: 'clickhouse',
            auditTrail: await getFlags().isAuditTrailEnabled(account.uuid)
        }
    });
});
