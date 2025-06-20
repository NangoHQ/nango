import { z } from 'zod';

import { billing } from '@nangohq/billing';
import { plansList } from '@nangohq/shared';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { PostPlanChange } from '@nangohq/types';

const orbIds = plansList.map((p) => p.orbId).filter(Boolean) as string[];
const validation = z
    .object({
        immediate: z.boolean(),
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

    const { plan } = res.locals;
    const body: PostPlanChange['Body'] = val.data;

    if (!plan?.orb_subscription_id) {
        res.status(400).send({ error: { code: 'invalid_body', message: "team doesn't not have a subscription" } });
        return;
    }

    const resUpgrade = await billing.upgrade({ subscriptionId: plan.orb_subscription_id, planExternalId: body.orbId, immediate: body.immediate });
    if (resUpgrade.isErr()) {
        report(resUpgrade.error);
        res.status(500).send({ error: { code: 'server_error' } });
        return;
    }

    res.status(200).send({
        data: true
    });
});
