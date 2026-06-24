import z from 'zod';

import { environmentService } from '@nangohq/shared';
import { BREAKDOWN_DIMENSIONS, TOP_N_BREAKDOWN_PAGE_SIZE } from '@nangohq/usage';
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
    connections: z.object({ metric: z.literal('connections'), dimension: z.enum(BREAKDOWN_DIMENSIONS.connections) }),
    data_transfer: z.object({ metric: z.literal('data_transfer'), dimension: z.enum(BREAKDOWN_DIMENSIONS.data_transfer) })
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
        // Substring match on the dimension value; the page size is fixed
        // server-side so callers only ever ask for "the next page".
        search: z.string().trim().min(1).optional(),
        page: z.coerce.number().int().nonnegative().optional()
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

    // `environment_id` stores the numeric id, but the user searches by env
    // name — a server-side substring match on the id can't match a name. Envs
    // per account are few (always within the first page), so for this one
    // dimension we never page or push `search` down: return the full small set
    // (page 0, no search) and let the dropdown filter by label client-side.
    const isEnvironmentId = query.dimension === 'environment_id';

    const result = await usageTracker.getTopDimensionValues({
        accountId: account.id,
        metric: query.metric,
        dimension: query.dimension,
        timeframe: { start: new Date(query.from), end: new Date(query.to) },
        search: isEnvironmentId ? undefined : query.search,
        page: isEnvironmentId ? 0 : (query.page ?? 0)
    });
    if (result.isErr()) {
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to get top dimension values' } });
        return;
    }

    let values: { id: string; label: string }[];
    if (isEnvironmentId) {
        const names = await environmentService.getEnvironmentNamesByIds(result.value.values.map(Number));
        values = result.value.values.map((id) => ({ id, label: names.get(Number(id)) ?? id }));
    } else {
        values = result.value.values.map((id) => ({ id, label: id }));
    }

    res.status(200).send({
        data: {
            values,
            pagination: {
                page: isEnvironmentId ? 0 : (query.page ?? 0),
                limit: TOP_N_BREAKDOWN_PAGE_SIZE,
                hasMore: isEnvironmentId ? false : result.value.hasMore
            }
        }
    });
});
