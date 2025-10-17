import { metrics as ddMetrics } from '@nangohq/utils';

import type { UsageMetric } from './metrics.js';
import type { IUsageTracker } from './usage.js';
import type { DBPlan } from '@nangohq/types';

export interface CappingStatus {
    isCapped: boolean;
    metrics: Partial<
        Record<
            UsageMetric,
            {
                limit: number | null;
                current: number | null;
                isCapped: boolean;
            }
        >
    >;
    message?: string;
}

export class Capping {
    constructor(
        public readonly usageTracker: IUsageTracker,
        private options?: { enabled?: boolean }
    ) {}

    public async getStatus(plan: DBPlan | null, ...metrics: UsageMetric[]): Promise<CappingStatus> {
        const status: CappingStatus = { isCapped: false, metrics: {} };

        if (!plan) {
            return status;
        }

        await Promise.all(
            [...new Set(metrics)].map(async (metric) => {
                const limit = this.getLimit(plan, metric);
                if (limit === null) {
                    return;
                }
                const usage = await this.usageTracker.get({ accountId: plan.account_id, metric });
                if (usage.isErr()) {
                    return;
                }
                const current = usage.value.current;
                const isCapped = current >= limit;

                if (isCapped) {
                    status.isCapped = true;
                    status.metrics[metric] = { limit, current, isCapped };
                }
            })
        );

        const messages = (Object.keys(status.metrics) as UsageMetric[]).flatMap((metric) => {
            if (status.metrics[metric]?.isCapped) {
                return [this.cappingMessage(metric)];
            }
            return [];
        });

        if (messages.length > 0) {
            status.message = messages.join(' ') + ' Please upgrade your plan to remove the limits.';
        }

        // Emit a datadog metric if the account is capped on any metric
        if (status.isCapped) {
            const dimensions = {
                accountId: plan.account_id,
                dryRun: this.options?.enabled ? 'false' : 'true',
                ...Object.fromEntries(Object.keys(status.metrics).map((key) => [key, 'true']))
            };
            ddMetrics.increment(ddMetrics.Types.USAGE_IS_CAPPED, 1, dimensions);
        }

        // If capping is disabled, always return not capped
        if (!this.options?.enabled) {
            return { isCapped: false, metrics: {} };
        }

        return status;
    }

    private getLimit(plan: DBPlan, metric: UsageMetric): number | null {
        switch (metric) {
            case 'connections':
                return plan.connections_max;
            case 'records':
                return plan.records_max;
            case 'proxy':
                return plan.proxy_max;
            case 'function_executions':
                return plan.function_executions_max;
            case 'function_compute_gbms':
                return plan.function_compute_gbms_max;
            case 'webhook_forwards':
                return plan.webhook_forwards_max;
            case 'function_logs':
                return plan.function_logs_max;
        }
    }

    private cappingMessage(metric: UsageMetric): string {
        switch (metric) {
            case 'connections':
                return 'You have reached the maximum number of connections for your plan.';
            case 'records':
                return 'You have reached the maximum number of records for your plan.';
            case 'proxy':
                return 'You have reached the maximum number of proxy requests for your plan.';
            case 'function_executions':
                return 'You have reached the maximum number of function executions for your plan.';
            case 'function_compute_gbms':
                return 'You have reached the maximum compute time of your functions for your plan.';
            case 'webhook_forwards':
                return 'You have reached the maximum number of webhook forwards for your plan.';
            case 'function_logs':
                return 'You have reached the maximum number of function logs for your plan.';
        }
    }
}
