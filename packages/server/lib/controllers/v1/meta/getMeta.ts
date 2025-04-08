import { environmentService, getOnboarding } from '@nangohq/shared';
import { NANGO_VERSION, baseUrl, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { planToApi } from '../../../formatters/plan.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { GetMeta } from '@nangohq/types';

export const getMeta = asyncWrapper<GetMeta>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { user: sessionUser, plan } = res.locals;

    const environments = await environmentService.getEnvironmentsByAccountId(sessionUser.account_id);
    const onboarding = await getOnboarding(sessionUser.id);
    res.status(200).send({
        data: {
            plan: plan ? planToApi(plan) : null,
            environments: environments.map((env) => {
                return { name: env.name };
            }),
            version: NANGO_VERSION,
            baseUrl,
            debugMode: req.session.debugMode === true,
            onboardingComplete: onboarding?.complete || false
        }
    });
});
