import { accountService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { GetOnboardingHearAboutUs } from '@nangohq/types';

export const getOnboardingHearAboutUs = asyncWrapper<GetOnboardingHearAboutUs>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: false });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const showHearAboutUs = await accountService.shouldShowHearAboutUs(res.locals.account);

    res.status(200).send({
        data: {
            showHearAboutUs
        }
    });
});
