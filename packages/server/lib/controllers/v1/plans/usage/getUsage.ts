import { getAccountUsageTracker } from '@nangohq/account-usage';
import { connectionService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { GetUsage } from '@nangohq/types';

const accountUsageTracker = await getAccountUsageTracker();

export const getUsage = asyncWrapper<GetUsage>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { account, plan } = res.locals;
    if (!plan) {
        res.status(400).send({ error: { code: 'feature_disabled' } });
        return;
    }

    res.status(200).send({
        data: [
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
        ]
    });
});
