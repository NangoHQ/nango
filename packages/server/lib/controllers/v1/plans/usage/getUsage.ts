import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { getMetricLabel } from '../../../../formatters/billingUsage.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { usageTracker } from '../../../../utils/usage.js';

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

    const usage = await usageTracker.getAll(account.id);
    if (usage.isErr()) {
        res.status(500).send({ error: { code: 'generic_error_support', message: usage.error.message } });
        return;
    }

    const data = {
        connections: {
            label: getMetricLabel('connections'),
            usage: usage.value.connections.current,
            limit: plan.connections_max
        },
        proxy: {
            label: getMetricLabel('proxy'),
            usage: usage.value.proxy.current,
            limit: plan.proxy_max
        },
        function_compute_gbms: {
            label: getMetricLabel('function_compute_gbms'),
            usage: usage.value.function_compute_gbms.current,
            limit: plan.function_compute_gbms_max
        },
        function_executions: {
            label: getMetricLabel('function_executions'),
            usage: usage.value.function_executions.current,
            limit: plan.function_executions_max
        },
        function_logs: {
            label: getMetricLabel('function_logs'),
            usage: usage.value.function_logs.current,
            limit: plan.function_logs_max
        },
        records: {
            label: getMetricLabel('records'),
            usage: usage.value.records.current,
            limit: plan.records_max
        },
        webhook_forwards: {
            label: getMetricLabel('webhook_forwards'),
            usage: usage.value.webhook_forwards.current,
            limit: plan.webhook_forwards_max
        }
    };

    res.status(200).send({ data });
});
