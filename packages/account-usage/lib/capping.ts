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
        private readonly usageTracker: IUsageTracker,
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

                if (this.options?.enabled && isCapped) {
                    status.isCapped = true;
                }

                status.metrics[metric] = { limit, current, isCapped };
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
            case 'external_webhooks':
                return plan.external_webhooks_max;
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
            case 'external_webhooks':
                return 'You have reached the maximum number of external webhooks for your plan.';
            case 'function_logs':
                return 'You have reached the maximum number of function logs for your plan.';
        }
    }
}
