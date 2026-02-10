import { userService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { GetOnboardingHearAboutUs } from '@nangohq/types';

export const getOnboardingHearAboutUs = asyncWrapper<GetOnboardingHearAboutUs>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: false });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const account = res.locals.account;
    const count = await userService.countUsers(account.id);
    const hasNotSetFoundUs = account.found_us === null || account.found_us === '';
    const showHearAboutUs = hasNotSetFoundUs && count === 1;

    res.status(200).send({
        data: {
            showHearAboutUs
        }
    });
});
