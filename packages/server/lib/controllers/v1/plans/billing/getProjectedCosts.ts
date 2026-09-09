import z from 'zod';

import { PAY_AS_YOU_GO_METRICS, projectPayAsYouGo } from '@nangohq/billing';
import { getPlanDefinition } from '@nangohq/shared';
import { report, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { usageTracker } from '../../../../utils/usage.js';

import type { GetProjectedCosts } from '@nangohq/types';

const TARGET_PLAN = 'pay-as-you-go';

const NOT_APPLICABLE: GetProjectedCosts['Success']['data'] = {
    metrics: {},
    subtotalInCents: 0,
    minimumInCents: 0,
    minimumApplied: false,
    growthAddOnInCents: 0,
    totalInCents: 0,
    periodComplete: false,
    currency: 'USD',
    notApplicable: true
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
    .refine((data) => (data.from === undefined) === (data.to === undefined), {
        message: 'from and to must be provided together',
        path: ['from']
    })
    .refine((data) => !data.from || !data.to || new Date(data.from) < new Date(data.to), {
        message: 'From date must be before to date',
        path: ['from']
    });

export const getProjectedCosts = asyncWrapper<GetProjectedCosts>(async (req, res) => {
    const val = querySchema.safeParse(req.query);
    if (!val.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(val.error) } });
        return;
    }
    const query = val.data;

    const { plan, account } = res.locals;
    if (!plan) {
        res.status(400).send({ error: { code: 'feature_disabled' } });
        return;
    }

    // Orb's schedule alone. An `isSpendPlan` check would exclude the retired plans being migrated.
    const changeAt = plan.orb_future_plan_at ? new Date(plan.orb_future_plan_at) : null;
    const scheduled = plan.orb_future_plan === TARGET_PLAN && changeAt !== null && !Number.isNaN(changeAt.getTime()) && changeAt > new Date();
    // Staff impersonating an account also get the projection, to check the view on real data before
    // scheduling anything. Only `postImpersonate` sets `debugMode`, so an account cannot ask itself.
    const previewing = req.session?.debugMode === true;
    if (!scheduled && !previewing) {
        res.status(200).send({ data: NOT_APPLICABLE });
        return;
    }

    const timeframe = query.from && query.to ? { start: new Date(query.from), end: new Date(query.to) } : null;

    // The same opts the usage table requests, so charge ÷ displayed quantity equals the rate.
    const usage = await usageTracker.getBillingUsage('', account.id, {
        granularity: 'day',
        ...(timeframe ? { timeframe } : {}),
        metrics: [...PAY_AS_YOU_GO_METRICS],
        avgPerDay: true
    });
    if (usage.isErr()) {
        report(usage.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to get usage' } });
        return;
    }

    const isGrowth = getPlanDefinition(plan.name)?.keepsGrowthAddOnOnMigration === true;

    let projection: ReturnType<typeof projectPayAsYouGo>;
    try {
        projection = projectPayAsYouGo(
            {
                connections: usage.value.connections?.total ?? 0,
                function_duration_seconds: usage.value.function_duration_seconds?.total ?? 0,
                data_transfer: usage.value.data_transfer?.total ?? 0
            },
            { isGrowth }
        );
    } catch (err) {
        report(err);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to project costs' } });
        return;
    }

    const periodComplete = timeframe !== null && timeframe.end <= new Date();

    res.status(200).send({
        data: {
            metrics: projection.metrics,
            subtotalInCents: projection.subtotalInCents,
            minimumInCents: projection.minimumInCents,
            minimumApplied: projection.minimumApplied,
            growthAddOnInCents: projection.growthAddOnInCents,
            totalInCents: projection.totalInCents,
            periodComplete,
            currency: 'USD',
            notApplicable: false
        }
    });
});
