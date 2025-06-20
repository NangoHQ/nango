import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { planToApi } from '../../../formatters/plan.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { GetPlan } from '@nangohq/types';

export const getPlanCurrent = asyncWrapper<GetPlan>((req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { plan } = res.locals;
    if (!plan) {
        res.status(400).send({ error: { code: 'feature_disabled' } });
        return;
    }

    res.status(200).send({
        data: planToApi(plan)
    });
});
