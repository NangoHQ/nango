import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { baseUrl, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { NANGO_VERSION, environmentService, getOnboarding } from '@nangohq/shared';
import type { GetMeta } from '@nangohq/types';

export const getMeta = asyncWrapper<GetMeta>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const sessionUser = res.locals['user'];

    const environments = await environmentService.getEnvironmentsByAccountId(sessionUser.account_id);
    const onboarding = await getOnboarding(sessionUser.id);
    res.status(200).send({
        data: {
            environments,
            version: NANGO_VERSION,
            baseUrl,
            debugMode: req.session.debugMode === true,
            onboardingComplete: onboarding?.complete || false
        }
    });
});
