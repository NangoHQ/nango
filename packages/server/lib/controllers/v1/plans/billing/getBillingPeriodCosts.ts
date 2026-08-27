import { billing } from '@nangohq/billing';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { isSpendPlan } from '../../../../utils/spendPlans.js';

import type { GetBillingPeriodCosts } from '@nangohq/types';

const NO_COSTS: GetBillingPeriodCosts['Success']['data'] = { metrics: {}, malformedMetrics: [], fullyAttributed: true, currency: null, noCosts: true };

export const getBillingPeriodCosts = asyncWrapper<GetBillingPeriodCosts>(async (req, res) => {
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

    if (!isSpendPlan(plan)) {
        res.status(200).send({ data: NO_COSTS });
        return;
    }

    // A spend plan can exist before its Orb subscription is linked — granted manually, or a
    // deployment with billing switched off.
    if (!plan.orb_subscription_id) {
        res.status(200).send({ data: NO_COSTS });
        return;
    }

    const costsRes = await billing.getPeriodCosts(plan.orb_subscription_id);
    if (costsRes.isErr()) {
        report(costsRes.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to get period costs' } });
        return;
    }

    const costs = costsRes.value;
    if (!costs) {
        res.status(200).send({ data: NO_COSTS });
        return;
    }

    res.status(200).send({
        data: {
            metrics: costs.metrics,
            malformedMetrics: costs.malformedMetrics,
            fullyAttributed: costs.fullyAttributed,
            currency: costs.currency,
            noCosts: false
        }
    });
});
