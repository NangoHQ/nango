import z from 'zod';

import { BREAKDOWN_DIMENSIONS, TOP_N_BREAKDOWN_CAP, TOP_N_BREAKDOWN_DEFAULT } from '@nangohq/usage';
import { zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { usageTracker } from '../../../../utils/usage.js';

import type { GetBillingUsageTopValues, UsageMetric } from '@nangohq/types';

const ALL_METRICS = Object.keys(BREAKDOWN_DIMENSIONS) as [UsageMetric, ...UsageMetric[]];

const querySchema = z
    .object({
        env: z.string(),
        metric: z.enum(ALL_METRICS),
        dimension: z.string().min(1),
        from: z.iso.datetime(),
        to: z.iso.datetime(),
        limit: z.coerce.number().int().positive().max(TOP_N_BREAKDOWN_CAP).optional()
    })
    .refine((data) => (BREAKDOWN_DIMENSIONS[data.metric] as readonly string[]).includes(data.dimension), {
        message: 'invalid dimension for metric',
        path: ['dimension']
    })
    .refine((data) => new Date(data.from) <= new Date(data.to), {
        message: 'from date must be before to date',
        path: ['from']
    });

export const getBillingUsageTopValues = asyncWrapper<GetBillingUsageTopValues>(async (req, res) => {
    const parsedQuery = querySchema.safeParse(req.query);
    if (!parsedQuery.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(parsedQuery.error) } });
        return;
    }
    const query = parsedQuery.data;
    const { account } = res.locals;

    const result = await usageTracker.getTopValues({
        accountId: account.id,
        metric: query.metric,
        dimension: query.dimension,
        timeframe: { start: new Date(query.from), end: new Date(query.to) },
        limit: query.limit ?? TOP_N_BREAKDOWN_DEFAULT
    });
    if (result.isErr()) {
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to get top values' } });
        return;
    }

    res.status(200).send({ data: { values: result.value.values } });
});
