import { z } from 'zod';

import { billing } from '@nangohq/billing';
import { plansList } from '@nangohq/shared';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { downgradePlan, upgradePlan } from '../../../../services/planChange.service.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { PlanChangeError } from '../../../../services/planChange.service.js';
import type { RequestLocals } from '../../../../utils/express.js';
import type { PostPlanChange } from '@nangohq/types';
import type { Response } from 'express';

type PlanChangeResponse = Response<PostPlanChange['Reply'], RequestLocals>;

function sendPlanChangeError(res: PlanChangeResponse, error: PlanChangeError): void {
    switch (error.code) {
        case 'not_linked_to_stripe':
            res.status(400).send({ error: { code: 'invalid_body', message: 'team is not linked to stripe' } });
            return;
        case 'already_scheduled':
            res.status(400).send({ error: { code: 'invalid_body', message: 'team is already scheduled to be downgraded' } });
            return;
        case 'upgrade_failed':
        case 'downgrade_failed':
            // Already reported with its cause by the service, which has the context to describe it
            res.status(500).send({ error: { code: 'server_error' } });
            return;
        default:
            ((exhaustiveCheck: never) => {
                throw new Error(`Unhandled plan change error code: ${exhaustiveCheck}`);
            })(error.code);
    }
}

const orbIds = plansList.map((p) => p.code).filter(Boolean) as string[];
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

    const newPlan = plansList.find((p) => p.code === body.orbId)!;

    if (newPlan.code === currentDef.code) {
        res.status(400).send({ error: { code: 'invalid_body', message: 'team is already on this plan' } });
        return;
    }

    const isUpgrade = plansList.filter((p) => currentDef.nextPlan?.includes(p.code))?.find((p) => p.code === body.orbId);
    const isDowngrade = currentDef.prevPlan?.includes(body.orbId);
    if (!isUpgrade && !isDowngrade) {
        res.status(400).send({ error: { code: 'invalid_body', message: 'team cannot change to this plan' } });
        return;
    }

    try {
        const sub = (await billing.getSubscription(account.id)).unwrap();
        if (!sub) {
            res.status(400).send({ error: { code: 'invalid_body', message: "team doesn't not have a subscription" } });
            return;
        }

        // We can't change the plan if there's a pending change; need to cancel it first.
        if (sub?.pendingChangeId) {
            (await billing.client.cancelPendingChanges({ pendingChangeId: sub.pendingChangeId })).unwrap();
        }
    } catch (err) {
        res.status(500).send({ error: { code: 'server_error' } });
        report(err);
        return;
    }

    const context = { team: account, plan, subscriptionId: plan.orb_subscription_id, newPlanCode: body.orbId };

    if (isUpgrade) {
        const upgraded = await upgradePlan(context);
        if (upgraded.isErr()) {
            sendPlanChangeError(res, upgraded.error);
            return;
        }

        // A pending intent still needs the client to confirm the card; without one, the change is done
        const { paymentIntent } = upgraded.value;
        res.status(200).send({ data: paymentIntent ? { paymentIntent } : { success: true } });
        return;
    }

    const downgraded = await downgradePlan(context);
    if (downgraded.isErr()) {
        sendPlanChangeError(res, downgraded.error);
        return;
    }

    res.status(200).send({ data: { success: true } });
});
