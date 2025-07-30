import { getAccountUsageTracker } from '@nangohq/account-usage';
import { connectionService } from '@nangohq/shared';

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
