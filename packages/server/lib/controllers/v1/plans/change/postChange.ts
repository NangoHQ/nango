import { z } from 'zod';

import { billing, getStripe } from '@nangohq/billing';
import { getMatchingPlanDefinition, plansList, productTracking } from '@nangohq/shared';
import { getLogger, report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { PostPlanChange } from '@nangohq/types';

const logger = getLogger('orb');

const names = plansList.map((p) => p.name).filter(Boolean) as string[];
const validation = z
    .object({
        name: z.enum(names as [string, ...string[]]),
        version: z.number().optional()
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
    if (!plan) {
        res.status(500).send({ error: { code: 'server_error', message: 'team has no plan' } });
        return;
    }

    const body: PostPlanChange['Body'] = val.data;
    const currentPlan = getMatchingPlanDefinition(plan.name, plan.version);
    if (!currentPlan) {
        res.status(400).send({ error: { code: 'invalid_body', message: 'team has an invalid plan' } });
        return;
    }
    if (!plan?.orb_subscription_id) {
        res.status(400).send({ error: { code: 'invalid_body', message: "team doesn't not have a subscription" } });
        return;
    }
    if (!currentPlan.canChange) {
        res.status(400).send({ error: { code: 'invalid_body', message: 'team cannot change plan' } });
        return;
    }

    const newPlan = getMatchingPlanDefinition(body.name, body.version);
    if (!newPlan) {
        res.status(400).send({ error: { code: 'invalid_body', message: 'new plan not found' } });
        return;
    }

    if (newPlan.name === currentPlan.name) {
        res.status(400).send({ error: { code: 'invalid_body', message: 'team is already on this plan' } });
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

    const isUpgrade = currentPlan.nextPlan?.includes(newPlan);

    // -- Upgrade
    if (isUpgrade) {
        if (!plan.stripe_payment_id || !plan.stripe_customer_id) {
            res.status(400).send({ error: { code: 'invalid_body', message: 'team is not linked to stripe' } });
            return;
        }

        let hasPending: string | undefined;
        try {
            logger.info(`Upgrading ${account.id} to ${body.name} version ${body.version ?? 'latest'}`);

            // Schedule an upgrade
            const resUpgrade = await billing.upgrade({ subscriptionId: plan.orb_subscription_id, planExternalId: body.name });
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
        if (newPlan.isPaid && (!plan.stripe_payment_id || !plan.stripe_customer_id)) {
            res.status(400).send({ error: { code: 'invalid_body', message: 'team is not linked to stripe' } });
            return;
        }

        logger.info(`Downgrading ${account.id} to ${body.name} version ${body.version ?? 'latest'}`);

        const resDowngrade = await billing.downgrade({ subscriptionId: plan.orb_subscription_id, planExternalId: body.name });
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
            eventProperties: { previousPlan: plan.name, newPlan: body.name, newPlanVersion: body.version ?? -1, orbCustomerId: plan.orb_customer_id }
        });
        return;
    }
});
