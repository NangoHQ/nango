import { getAccountUsageTracker } from '@nangohq/account-usage';

import { sendUsageLimitReachedEmail, sendUsageNearLimitEmail } from './email.js';
import connectionService from '../services/connection.service.js';
import userService from '../services/user.service.js';

import type { AccountUsageMetric } from '@nangohq/account-usage';
import type { DBPlan, DBTeam, MetricUsage } from '@nangohq/types';

export async function getAccountMetricsUsage(account: DBTeam, plan: DBPlan): Promise<MetricUsage[]> {
    const accountUsageTracker = await getAccountUsageTracker();
    return [
        {
            metric: 'connections',
            label: 'Connections',
            usage: await connectionService.countByAccountId(account.id),
            limit: plan.connections_max
        },
        {
            metric: 'actions',
            label: 'Actions',
            usage:
                (await accountUsageTracker.getUsage({
                    accountId: account.id,
                    metric: 'actions'
                })) ?? 0,
            limit: plan.monthly_actions_max
        },
        {
            metric: 'active_records',
            label: 'Synced Records',
            usage:
                (await accountUsageTracker.getUsage({
                    accountId: account.id,
                    metric: 'active_records'
                })) ?? 0,
            limit: plan.monthly_active_records_max
        }
    ];
}

export async function onUsageIncreased({ account, plan, metric, delta }: { account: DBTeam; plan: DBPlan; metric: AccountUsageMetric; delta: number }) {
    const accountUsageTracker = await getAccountUsageTracker();
    const limit = accountUsageTracker.getLimit(plan, metric);
    const currentUsage = await accountUsageTracker.getUsage({ accountId: account.id, metric });

    if (limit === null || currentUsage === null || delta === 0) {
        return;
    }

    // Check if usage just crossed the limit
    if (currentUsage < limit && currentUsage >= limit) {
        const usage = await getAccountMetricsUsage(account, plan);
        const users = await userService.getUsersByAccountId(plan.account_id);
        await Promise.all(
            users.map((user) => {
                return sendUsageLimitReachedEmail({ user, account, usage });
            })
        );
        return;
    }

    const nearLimit = limit * 0.8;
    // Check if usage just crossed 80% of the limit
    if (currentUsage - delta < nearLimit && currentUsage >= nearLimit) {
        const usage = await getAccountMetricsUsage(account, plan);
        const users = await userService.getUsersByAccountId(plan.account_id);
        await Promise.all(
            users.map((user) => {
                return sendUsageNearLimitEmail({ user, account, usage });
            })
        );
    }
}
