import { billing } from '@nangohq/billing';
import { report, requireEmptyBody, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { DeleteSpendAlert } from '@nangohq/types';

export const deleteSpendAlert = asyncWrapper<DeleteSpendAlert>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const emptyBody = requireEmptyBody(req);
    if (emptyBody) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(emptyBody.error) } });
        return;
    }

    const { plan } = res.locals;
    if (!plan) {
        res.status(400).send({ error: { code: 'feature_disabled' } });
        return;
    }

    // Not gated on isSpendPlan: a plan can leave the allowlist while an alert is still configured,
    // and clearing one should never be the operation that's unavailable.
    if (!plan.orb_subscription_id) {
        res.status(200).send({ success: true });
        return;
    }

    const removed = await billing.removeSpendAlert(plan.orb_subscription_id);
    if (removed.isErr()) {
        report(removed.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to remove spend alert' } });
        return;
    }

    res.status(200).send({ success: true });
});
