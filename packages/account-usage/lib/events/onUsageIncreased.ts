import db from '@nangohq/database';
import { getLocking } from '@nangohq/kvstore';
import { accountService, getPlan, userService } from '@nangohq/shared';

import { sendUsageLimitReachedEmail, sendUsageNearLimitEmail } from '../emails.js';
import { getAccountUsageTracker } from '../index.js';

import type { AccountUsageMetric } from '../index.js';
import type { DBPlan } from '@nangohq/types';

export async function onUsageIncreased({
    accountId,
    metric,
    delta,
    plan
}: {
    accountId: number;
    metric: AccountUsageMetric;
    delta: number;
    plan?: DBPlan | undefined;
}) {
    if (delta === 0) {
        return;
    }

    let resolvedPlan: DBPlan | undefined = plan;

    if (!resolvedPlan) {
        const planResult = await getPlan(db.knex, { accountId });

        if (planResult.isErr()) {
            return;
        }

        resolvedPlan = planResult.value;
    }

    const locking = await getLocking();
    const lock = await locking.acquire(`account-usage-${accountId}-${metric}`, 1000);

    const accountUsageTracker = await getAccountUsageTracker();

    const limit = accountUsageTracker.getLimit(resolvedPlan, metric);
    const currentUsage = await accountUsageTracker.getUsage({ accountId: accountId, metric });

    if (limit === null || currentUsage === null) {
        await locking.release(lock);
        return;
    }

    const crossedLimit = currentUsage - delta < limit && currentUsage >= limit;
    const crossed80Percent = currentUsage - delta < limit * 0.8 && currentUsage >= limit * 0.8;

    if (!crossedLimit && !crossed80Percent) {
        await locking.release(lock);
        return;
    }

    const account = await accountService.getAccountById(db.knex, accountId);

    if (!account) {
        await locking.release(lock);
        return;
    }

    const usage = await accountUsageTracker.getAccountMetricsUsage(account, resolvedPlan);
    const users = await userService.getUsersByAccountId(accountId);

    await Promise.all(
        users.map((user) => {
            // Full limit reached prioritized in case usage jumps directly to it
            if (crossedLimit) {
                return sendUsageLimitReachedEmail({ user, account, usage, triggeringMetric: metric });
            }

            return sendUsageNearLimitEmail({ user, account, usage, triggeringMetric: metric });
        })
    );

    await locking.release(lock);
}
