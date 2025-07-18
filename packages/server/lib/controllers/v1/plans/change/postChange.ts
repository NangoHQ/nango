import { z } from 'zod';

import { billing } from '@nangohq/billing';
import { plansList, productTracking } from '@nangohq/shared';
import { getLogger, report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { getStripe } from '../../../../utils/stripe.js';

import type { PostPlanChange } from '@nangohq/types';

const logger = getLogger('orb');

const orbIds = plansList.map((p) => p.orbId).filter(Boolean) as string[];
const validation = z
    .object({
        orbId: z.enum(orbIds as [string, ...string[]])
    })
    .strict();

export const postPlanChange = asyncWrapper<PostPlanChange>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = validation.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({
            error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) }
        });
        return;
    }

    const { account, plan } = res.locals;
    const body: PostPlanChange['Body'] = val.data;
    const currentDef = plansList.find((p) => p.code === plan!.name);
    if (!currentDef) {
        res.status(400).send({ error: { code: 'invalid_body', message: 'team has an invalid plan' } });
        return;
    }
    if (!plan?.orb_subscription_id) {
        res.status(400).send({ error: { code: 'invalid_body', message: "team doesn't not have a subscription" } });
        return;
    }
    if (!currentDef.canChange) {
        res.status(400).send({ error: { code: 'invalid_body', message: 'team cannot change plan' } });
        return;
    }

    const newPlan = plansList.find((p) => p.orbId === body.orbId)!;

    if (!plan.stripe_payment_id || !plan.stripe_customer_id) {
        res.status(400).send({ error: { code: 'invalid_body', message: 'team is not linked to stripe' } });
        return;
    }

    try {
        const sub = (await billing.getSubscription(account.id)).unwrap();
        if (!sub) {
            res.status(400).send({ error: { code: 'invalid_body', message: "team doesn't not have a subscription" } });
            return;
        }

        // if there is a pending change we can't change the plan
        // so we need to cancel it first
        if (sub?.pendingChangeId) {
            (await billing.client.cancelPendingChanges({ pendingChangeId: sub.pendingChangeId })).unwrap();
        }
    } catch (err) {
        res.status(500).send({ error: { code: 'server_error' } });
        report(err);
        return;
    }

    const isUpgrade = plansList.filter((p) => currentDef.nextPlan?.includes(p.code))?.find((p) => p.orbId === body.orbId);

    // -- Upgrade
    if (isUpgrade) {
        let hasPending: string | undefined;
        try {
            logger.info(`Upgrading ${account.id} to ${body.orbId}`);

            // Schedule an upgrade
            const resUpgrade = await billing.upgrade({ subscriptionId: plan.orb_subscription_id, planExternalId: body.orbId });
            if (resUpgrade.isErr()) {
                report(resUpgrade.error);
                res.status(500).send({ error: { code: 'server_error' } });
                return;
            }
            hasPending = resUpgrade.value.pendingChangeId;

            const stripe = getStripe();

            logger.info(`Asking for base fee ${resUpgrade.value.amountInCents} for ${account.id}`);

            // Create a payment intent to confirm the card
            const paymentIntent = await stripe.paymentIntents.create({
                metadata: { accountUuid: account.uuid },
                amount: resUpgrade.value.amountInCents ? Math.round(resUpgrade.value.amountInCents) : newPlan.basePrice! * 100,
                currency: 'usd',
                customer: plan.stripe_customer_id,
                payment_method: plan.stripe_payment_id
            });

            // The payment will be confirmed by the webhook
            if (paymentIntent.status !== 'succeeded') {
                res.status(200).send({ data: { paymentIntent } });
                return;
            }

            // Payment is auto confirmed
            // Never made it happen but it's a possibilty
            res.status(200).send({ data: { success: true } });
        } catch (err) {
            if (hasPending) {
                logger.info(`Error: cancelling pending change ${hasPending} for ${account.id}`);
                const resCancel = await billing.client.cancelPendingChanges({ pendingChangeId: hasPending });
                if (resCancel.isErr()) {
                    report(resCancel.error);
                    res.status(500).send({ error: { code: 'server_error' } });
                    return;
                }
            }
            report(err);
        }

        res.status(500).send({ error: { code: 'server_error' } });
        return;
    } else {
        // -- Downgrade
        logger.info(`Downgrading ${account.id} to ${body.orbId}`);

        const resDowngrade = await billing.downgrade({ subscriptionId: plan.orb_subscription_id, planExternalId: body.orbId });
        if (resDowngrade.isErr()) {
            report(resDowngrade.error);
            res.status(500).send({ error: { code: 'server_error' } });
            return;
        }

        res.status(200).send({
            data: { success: true }
        });

        productTracking.track({
            name: 'account:billing:downgraded',
            team: account,
            eventProperties: { previousPlan: plan.name, newPlan: body.orbId, orbCustomerId: plan.orb_customer_id }
        });
        return;
    }
});
