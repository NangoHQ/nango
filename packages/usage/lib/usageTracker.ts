import { getLogger } from '@nangohq/utils';

import { metricFlags } from './metrics.js';

import type { UsageMetric } from './metrics.js';
import type { UsageStore } from './usageStore/usageStore.js';
import type { DBPlan } from '@nangohq/types';

const logger = getLogger('UsageTracker');

export class UsageTracker {
    constructor(private readonly usageStore: UsageStore) {}

    public async shouldCapUsage(plan: DBPlan, metric: UsageMetric): Promise<boolean> {
        try {
            const currentUsage = await this.usageStore.getUsage({ accountId: plan.account_id, metric });
            const limit = this.getLimit(plan, metric);

            if (limit === null) {
                return false;
            }

            return !!currentUsage && currentUsage >= limit;
        } catch (err) {
            logger.error(`Error checking if usage should be capped`, {
                error: err,
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
    public async incrementUsage(accountId: number, metric: UsageMetric, delta: number = 1): Promise<number> {
        return this.usageStore.incrementUsage({ accountId, metric, delta });
    }

    public async getUsage(accountId: number, metric: UsageMetric): Promise<number | null> {
        return this.usageStore.getUsage({ accountId, metric });
    }

    public getLimit(plan: DBPlan, metric: UsageMetric): number | null {
        const flag = metricFlags[metric];
        return plan[flag as keyof DBPlan] as number | null;
    }
}
