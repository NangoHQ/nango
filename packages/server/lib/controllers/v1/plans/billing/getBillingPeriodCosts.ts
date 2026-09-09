import z from 'zod';

import { billing } from '@nangohq/billing';
import { report, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { isSpendPlan } from '../../../../utils/spendPlans.js';

import type { GetBillingPeriodCosts } from '@nangohq/types';

const NO_COSTS: GetBillingPeriodCosts['Success']['data'] = {
    metrics: {},
    malformedMetrics: [],
    fullyAttributed: true,
    fixedInCents: 0,
    currency: null,
    noCosts: true
};

const querySchema = z
    .strictObject({
        env: z
            .string()
            .regex(/^[a-zA-Z0-9_-]+$/)
            .max(255),
        from: z.iso.datetime().optional(),
        to: z.iso.datetime().optional()
    })
    // Both or neither: one half of a window would otherwise fall through to the current period,
    // answering with a different month's charges than the caller asked for.
    .refine((data) => (data.from === undefined) === (data.to === undefined), {
        message: 'from and to must be provided together',
        path: ['from']
    })
    .refine((data) => !data.from || !data.to || new Date(data.from) < new Date(data.to), {
        message: 'From date must be before to date',
        path: ['from']
    });

export const getBillingPeriodCosts = asyncWrapper<GetBillingPeriodCosts>(async (req, res) => {
    const val = querySchema.safeParse(req.query);
    if (!val.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(val.error) } });
        return;
    }
    const query = val.data;

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

    const timeframe = query.from && query.to ? { start: new Date(query.from), end: new Date(query.to) } : undefined;
    const costsRes = await billing.getPeriodCosts(plan.orb_subscription_id, timeframe);
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
            fixedInCents: costs.fixedInCents,
            currency: costs.currency,
            noCosts: false
        }
    });
});
