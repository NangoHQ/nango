import z from 'zod';

import { BREAKDOWN_DIMENSIONS, TOP_N_BREAKDOWN_CAP, TOP_N_BREAKDOWN_DEFAULT } from '@nangohq/usage';
import { zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { usageTracker } from '../../../../utils/usage.js';

import type { GetBillingUsageTopDimensionValues, UsageMetric } from '@nangohq/types';

// One zod object per metric, each pinning `metric` to a literal and
// `dimension` to that metric's allowed enum. `z.discriminatedUnion` rejects
// invalid (metric, dim) pairs at parse time — no refine needed.
// `satisfies Record<UsageMetric, …>` forces an entry per metric — adding a
// new `UsageMetric` without updating this object fails to typecheck.
const metricBranches = {
    proxy: z.object({ metric: z.literal('proxy'), dimension: z.enum(BREAKDOWN_DIMENSIONS.proxy) }),
    function_executions: z.object({ metric: z.literal('function_executions'), dimension: z.enum(BREAKDOWN_DIMENSIONS.function_executions) }),
    function_logs: z.object({ metric: z.literal('function_logs'), dimension: z.enum(BREAKDOWN_DIMENSIONS.function_logs) }),
    function_compute_gbms: z.object({ metric: z.literal('function_compute_gbms'), dimension: z.enum(BREAKDOWN_DIMENSIONS.function_compute_gbms) }),
    webhook_forwards: z.object({ metric: z.literal('webhook_forwards'), dimension: z.enum(BREAKDOWN_DIMENSIONS.webhook_forwards) }),
    records: z.object({ metric: z.literal('records'), dimension: z.enum(BREAKDOWN_DIMENSIONS.records) }),
    connections: z.object({ metric: z.literal('connections'), dimension: z.enum(BREAKDOWN_DIMENSIONS.connections) })
} satisfies Record<UsageMetric, z.ZodObject>;

// `Object.values` widens to a plain array; the cast restores the non-empty
// tuple shape `z.discriminatedUnion` requires.
type _Branches = (typeof metricBranches)[UsageMetric];
const metricAndDimensionSchema = z.discriminatedUnion('metric', Object.values(metricBranches) as [_Branches, ..._Branches[]]);

const querySchema = z
    .object({
        env: z.string(),
        from: z.iso.datetime(),
        to: z.iso.datetime(),
        limit: z.coerce.number().int().positive().max(TOP_N_BREAKDOWN_CAP).optional()
    })
    .and(metricAndDimensionSchema)
    .refine((data) => new Date(data.from) <= new Date(data.to), {
        message: 'from date must be before to date',
        path: ['from']
    });

export const getBillingUsageTopDimensionValues = asyncWrapper<GetBillingUsageTopDimensionValues>(async (req, res) => {
    const parsedQuery = querySchema.safeParse(req.query);
    if (!parsedQuery.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(parsedQuery.error) } });
        return;
    }
    const query = parsedQuery.data;
    const { account } = res.locals;

    const result = await usageTracker.getTopDimensionValues({
        accountId: account.id,
        metric: query.metric,
        dimension: query.dimension,
        timeframe: { start: new Date(query.from), end: new Date(query.to) },
        limit: query.limit ?? TOP_N_BREAKDOWN_DEFAULT
    });
    if (result.isErr()) {
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to get top dimension values' } });
        return;
    }

    res.status(200).send({ data: { values: result.value.values } });
});
