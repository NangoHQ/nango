import { billing } from '@nangohq/billing';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { linkOrbCustomer, linkOrbFreeSubscription } from '../../../../utils/linkOrb.js';

import type { GetUsage } from '@nangohq/types';

export const getUsage = asyncWrapper<GetUsage>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { account, user, plan } = res.locals;
    if (!plan) {
        res.status(400).send({ error: { code: 'feature_disabled' } });
        return;
    }

    // Backfill orb customer
    if (!plan.orb_customer_id) {
        const linkOrbCustomerRes = await linkOrbCustomer(account, user);
        if (linkOrbCustomerRes.isErr()) {
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to link Orb customer' } });
            return;
        }
    }

    // Backfill orb subscription (free by default)
    if (!plan.orb_subscription_id) {
        const linkOrbSubscriptionRes = await linkOrbFreeSubscription(account);
        if (linkOrbSubscriptionRes.isErr()) {
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to link Orb subscription' } });
            return;
        }
    }

    const [customerRes, subscriptionRes] = await Promise.all([
        await billing.getCustomer(account.id),
        // TODO: listen to webhook and store that subscription.id
        await billing.getSubscription(account.id)
    ]);
    if (customerRes.isErr()) {
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to get customer' } });
        return;
    }
    if (subscriptionRes.isErr() || !subscriptionRes.value) {
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to get subscription' } });
        return;
    }

    const sub = subscriptionRes.value;

    const currentRes = await billing.getUsage(sub.id);
    const previousRes = await billing.getUsage(sub.id, 'previous');
    if (currentRes.isErr() || previousRes.isErr()) {
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to get usage' } });
        return;
    }

    res.status(200).send({
        data: {
            customer: customerRes.value,
            current: currentRes.value,
            previous: previousRes.value
        }
    });
});
