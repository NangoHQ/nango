import { billing } from '@nangohq/billing';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { GetUsage } from '@nangohq/types';

export const getUsage = asyncWrapper<GetUsage>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { account } = res.locals;

    const [customer, subscription] = await Promise.all([
        await billing.getCustomer(account.id),
        // TODO: listen to webhook and store that subscription.id
        await billing.getSubscription(account.id)
    ]);
    if (!subscription) {
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to get subscription' } });
        return;
    }

    const current = await billing.getUsage(subscription.id);
    const previous = await billing.getUsage(subscription.id, 'previous');

    res.status(200).send({
        data: {
            customer,
            current,
            previous
        }
    });
});
