import db from '@nangohq/database';
import { productTracking, startTrial } from '@nangohq/shared';
import { flagHasPlan, requireEmptyBody, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

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

    const { plan, account, user } = res.locals;
    if (!flagHasPlan) {
        res.status(400).send({ error: { code: 'feature_disabled' } });
        return;
    }

    if (!plan || !plan.trial_start_at || !plan.trial_end_at || plan.name !== 'free') {
        res.status(400).send({ error: { code: 'conflict', message: 'No active trial' } });
        return;
    }

    await startTrial(db.knex, plan);

    productTracking.track({ name: 'account:trial:extend', team: account, user });

    res.status(200).send({
        data: { success: true }
    });
});
