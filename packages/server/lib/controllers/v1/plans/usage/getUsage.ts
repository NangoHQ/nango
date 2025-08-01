import { getAccountUsageTracker } from '@nangohq/account-usage';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { GetUsage } from '@nangohq/types';

export const getUsage = asyncWrapper<GetUsage>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { account, plan } = res.locals;
    if (!plan) {
        res.status(400).send({ error: { code: 'feature_disabled' } });
        return;
    }

    const accountUsageTracker = await getAccountUsageTracker();
    const usage = await accountUsageTracker.getAccountMetricsUsage(account, plan);

    res.status(200).send({
        data: usage
    });
});
