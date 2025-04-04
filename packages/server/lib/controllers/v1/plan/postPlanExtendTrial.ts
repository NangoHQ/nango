import db from '@nangohq/database';
import { AnalyticsTypes, TRIAL_DURATION, analytics, updatePlan } from '@nangohq/shared';
import { flagHasPlan, requireEmptyBody, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { PostPlanExtendTrial } from '@nangohq/types';

export const postPlanExtendTrial = asyncWrapper<PostPlanExtendTrial>(async (req, res) => {
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
    if (!flagHasPlan) {
        res.status(400).send({ error: { code: 'feature_disabled' } });
        return;
    }

    if (!plan || !plan.trial_start_at || !plan.trial_end_at || plan.name !== 'free') {
        res.status(400).send({ error: { code: 'conflict', message: 'No active trial' } });
        return;
    }

    await updatePlan(db.knex, {
        id: plan.id,
        trial_end_at: new Date(Date.now() + TRIAL_DURATION),
        trial_end_notified_at: null,
        trial_extension_count: plan.trial_extension_count + 1
    });

    void analytics.track(AnalyticsTypes.ACCOUNT_TRIAL_EXTEND, plan.account_id);

    res.status(200).send({
        data: { success: true }
    });
});
