import { report } from '@nangohq/utils';

import { metricFlags } from './metrics.js';

import type { AccountUsageStore, GetUsageParams, IncrementUsageParams } from './accountUsageStore/accountUsageStore.js';
import type { AccountUsageMetric } from './metrics.js';
import type { DBPlan } from '@nangohq/types';

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

    public async getUsage(params: GetUsageParams): Promise<number | null> {
        try {
            return await this.usageStore.getUsage(params);
        } catch (err) {
            report(new Error('Error getting usage', { cause: err }), { ...params });

            return null;
        }
    }

    public getLimit(plan: DBPlan, metric: AccountUsageMetric): number | null {
        const flag = metricFlags[metric];
        return plan[flag as keyof DBPlan] as number | null;
    }
}
