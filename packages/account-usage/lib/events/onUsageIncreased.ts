import db from '@nangohq/database';
import { accountService, getPlan, userService } from '@nangohq/shared';

import { sendUsageLimitReachedEmail, sendUsageNearLimitEmail } from '../emails.js';
import { getAccountUsageTracker } from '../index.js';

import type { AccountUsageMetric } from '../index.js';

export async function onUsageIncreased({ accountId, metric, delta }: { accountId: number; metric: AccountUsageMetric; delta: number }) {
    const planResult = await getPlan(db.knex, { accountId });

    if (planResult.isErr()) {
        return;
    }

    const plan = planResult.value;

    const accountUsageTracker = await getAccountUsageTracker();

    const limit = accountUsageTracker.getLimit(plan, metric);
    const currentUsage = await accountUsageTracker.getUsage({ accountId: accountId, metric });

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

    const usage = await accountUsageTracker.getAccountMetricsUsage(account, plan);
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
}
