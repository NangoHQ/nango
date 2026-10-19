import { z } from 'zod';

import { billing } from '@nangohq/billing';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { getSpendFloorInCents, isSpendPlan } from '../../../../utils/spendPlans.js';

import type { PutSpendAlert } from '@nangohq/types';

const validation = z
    .object({
        // Orb rejects a threshold it can't evaluate, so a slipped decimal point is caught here
        // rather than as an opaque Orb error.
        thresholdInCents: z.number().int().positive().max(1_000_000_000)
    })
    .strict();

// Every Orb customer is created in USD (see getOrCreateCustomer).
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export const putSpendAlert = asyncWrapper<PutSpendAlert>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = validation.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) } });
        return;
    }

    const { plan } = res.locals;
    if (!plan) {
        res.status(400).send({ error: { code: 'feature_disabled' } });
        return;
    }

    if (!isSpendPlan(plan)) {
        res.status(400).send({ error: { code: 'feature_disabled', message: 'Spend alerts are not available on this plan' } });
        return;
    }

    // Nothing to hang the alert on until Orb is linked, and that is configuration, not a fault.
    if (!plan.orb_subscription_id) {
        res.status(400).send({ error: { code: 'feature_disabled', message: 'Spend alerts are not available on this plan' } });
        return;
    }

    const floorInCents = getSpendFloorInCents(plan);
    if (val.data.thresholdInCents <= floorInCents) {
        const floor = usd.format(floorInCents / 100);
        res.status(400).send({
            error: {
                code: 'threshold_below_floor',
                message: `Your bill starts at ${floor} each month, so an alert at or below that would go off right away. Enter an amount above ${floor}.`
            }
        });
        return;
    }

    const alertRes = await billing.setSpendAlert(plan.orb_subscription_id, { thresholdInCents: val.data.thresholdInCents });
    if (alertRes.isErr()) {
        report(alertRes.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to save spend alert' } });
        return;
    }

    res.status(200).send({ data: { thresholdInCents: alertRes.value.thresholdInCents, currency: alertRes.value.currency } });
});
