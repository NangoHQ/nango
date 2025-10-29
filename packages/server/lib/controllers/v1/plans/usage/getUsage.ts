import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { capping } from '../../../../utils/capping.js';

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

    const usage = await capping.usageTracker.getAll(account.id);
    if (usage.isErr()) {
        res.status(500).send({ error: { code: 'generic_error_support', message: usage.error.message } });
        return;
    }

    const data = {
        connections: {
            label: 'Connections',
            usage: usage.value.connections.current,
            limit: plan.connections_max
        },
        proxy: {
            label: 'Proxy requests',
            usage: usage.value.proxy.current,
            limit: plan.proxy_max
        },
        functionCompute: {
            label: 'Function time (ms)',
            usage: usage.value.function_compute_gbms.current,
            limit: plan.function_compute_gbms_max
        },
        functionExecutions: {
            label: 'Function runs',
            usage: usage.value.function_executions.current,
            limit: plan.function_executions_max
        },
        functionLogs: {
            label: 'Function logs',
            usage: usage.value.function_logs.current,
            limit: plan.function_logs_max
        },
        records: {
            label: 'Sync records',
            usage: usage.value.records.current,
            limit: plan.records_max
        },
        webhookForwards: {
            label: 'Webhook forwarding',
            usage: usage.value.webhook_forwards.current,
            limit: plan.webhook_forwards_max
        }
    };

    res.status(200).send({ data });
});
