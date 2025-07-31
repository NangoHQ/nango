import { getAccountUsageTracker } from '@nangohq/account-usage';
import db from '@nangohq/database';

import { sendUsageLimitReachedEmail, sendUsageNearLimitEmail } from './email.js';
import accountService from '../services/account.service.js';
import connectionService from '../services/connection.service.js';
import { getPlan } from '../services/plans/plans.js';
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

export async function onUsageIncreased({ accountId, metric, delta }: { accountId: number; metric: AccountUsageMetric | 'connections'; delta: number }) {
    const planResult = await getPlan(db.knex, { accountId });

    if (planResult.isErr()) {
        return;
    }

    const plan = planResult.value;

    const accountUsageTracker = await getAccountUsageTracker();

    let limit: number | null = null;
    let currentUsage: number | null = null;
    if (metric === 'connections') {
        limit = plan.connections_max;
        currentUsage = await connectionService.countByAccountId(accountId);
    } else {
        limit = accountUsageTracker.getLimit(plan, metric);
        currentUsage = await accountUsageTracker.getUsage({ accountId: accountId, metric });
    }

    if (limit === null || currentUsage === null || delta === 0) {
        return;
    }

    const crossedLimit = currentUsage - delta < limit && currentUsage >= limit;
    const crossed80Percent = currentUsage - delta < limit * 0.8 && currentUsage >= limit * 0.8;

    if (!crossedLimit && !crossed80Percent) {
        return;
    }

    const account = await accountService.getAccountById(db.knex, accountId);

    if (!account) {
        return;
    }

    const usage = await getAccountMetricsUsage(account, plan);
    const users = await userService.getUsersByAccountId(accountId);

    await Promise.all(
        users.map((user) => {
            // Full limit reached prioritized in case usage jumps directly to it
            if (crossedLimit) {
                return sendUsageLimitReachedEmail({ user, account, usage });
            }

            return sendUsageNearLimitEmail({ user, account, usage });
        })
    );
}
