import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { requireEmptyBody, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { PatchOnboarding } from '@nangohq/types';
import { completeOnboarding } from '@nangohq/shared';

export const patchOnboarding = asyncWrapper<PatchOnboarding>(async (req, res) => {
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

    const { user } = res.locals;
    await completeOnboarding(user.id);

    res.status(200).send({
        data: { success: true }
    });
});
