import { getAccountUsageTracker } from '@nangohq/account-usage';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { envs } from '../../../../env.js';
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

    if (envs.USAGE_CAPPING_ENABLED) {
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
            records: {
                label: 'Records',
                usage: usage.value.records.current,
                limit: plan.records_max
            },
            proxy: {
                label: 'Proxy requests',
                usage: usage.value.proxy.current,
                limit: plan.proxy_max
            },
            functionExecutions: {
                label: 'Function Executions',
                usage: usage.value.function_executions.current,
                limit: plan.function_executions_max
            },
            functionCompute: {
                label: 'Compute (GB/s)',
                usage: usage.value.function_compute_gbms.current,
                limit: plan.function_compute_gbms_max
            },
            externalWebhooks: {
                label: 'External Webhooks',
                usage: usage.value.external_webhooks.current,
                limit: plan.external_webhooks_max
            },
            functionLogs: {
                label: 'Function Logs',
                usage: usage.value.function_logs.current,
                limit: plan.function_logs_max
            }
        };

        res.status(200).send({ data });
        return;
    }

    const accountUsageTracker = await getAccountUsageTracker();
    const usage = await accountUsageTracker.getAccountMetricsUsageSummary(account, plan);
    res.status(200).send({ data: usage });
});
