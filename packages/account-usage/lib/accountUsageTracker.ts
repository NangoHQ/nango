import { connectionService } from '@nangohq/shared';
import { report } from '@nangohq/utils';

import { metricFlags } from './metrics.js';

import type { AccountUsageStore, IncrementUsageParams } from './accountUsageStore/accountUsageStore.js';
import type { AccountMetricsUsageSummary, AccountUsageMetric, DBPlan, DBTeam } from '@nangohq/types';

/**
 * Tracks usage for an account. Prioritizes performance over precision.
 */
export class AccountUsageTracker {
    constructor(private readonly usageStore: AccountUsageStore) {}

    public async shouldCapUsage(plan: DBPlan, metric: AccountUsageMetric): Promise<boolean> {
        try {
            const currentUsage = await this.getUsage({ accountId: plan.account_id, metric });
            const limit = this.getLimit(plan, metric);

            if (limit === null) {
                return false;
            }

            return !!currentUsage && currentUsage >= limit;
        } catch (err) {
            report(new Error('Error checking if usage should be capped', { cause: err }), {
                accountId: plan.account_id,
                metric
            });

            // In an effort to avoid blocking, we return true if there is any error in obtaining metrics.
            return true;
        }
    }

    /**
     * Increments usage of given metric for current month.
     */
    public async incrementUsage(params: IncrementUsageParams): Promise<number> {
        try {
            return await this.usageStore.incrementUsage(params);
        } catch (err) {
            report(new Error('Error incrementing usage', { cause: err }), { ...params });

            // In an effort to avoid blocking, we return 0 if there is any error in incrementing usage.
            return 0;
        }
    }

    public async getUsage(params: { accountId: number; metric: AccountUsageMetric }): Promise<number | null> {
        try {
            if (params.metric === 'connections') {
                return await connectionService.countByAccountId(params.accountId);
            }

            return await this.usageStore.getUsage({ accountId: params.accountId, metric: params.metric });
        } catch (err) {
            report(new Error('Error getting usage', { cause: err }), { ...params });

            return null;
        }
    }

    public getLimit(plan: DBPlan, metric: AccountUsageMetric): number | null {
        const flag = metricFlags[metric];
        return plan[flag as keyof DBPlan] as number | null;
    }

    public async getAccountMetricsUsageSummary(account: DBTeam, plan: DBPlan): Promise<AccountMetricsUsageSummary> {
        return {
            connections: {
                label: 'Connections',
                usage:
                    (await this.getUsage({
                        accountId: account.id,
                        metric: 'connections'
                    })) ?? 0,
                limit: plan.connections_max
            },
            actions: {
                label: 'Actions',
                usage:
                    (await this.getUsage({
                        accountId: account.id,
                        metric: 'actions'
                    })) ?? 0,
                limit: plan.monthly_actions_max
            },
            active_records: {
                label: 'Synced Records',
                usage:
                    (await this.getUsage({
                        accountId: account.id,
                        metric: 'active_records'
                    })) ?? 0,
                limit: plan.monthly_active_records_max
            }
        };
    }
}
