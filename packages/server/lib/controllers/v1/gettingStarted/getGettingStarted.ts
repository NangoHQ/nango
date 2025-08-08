import { gettingStartedService } from '@nangohq/shared';
import { report } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { GetGettingStarted } from '@nangohq/types';

/**
 * Getting started should always be available, so if it doesn't already exist, we create it,
 * including setting up a new google-calendar-getting-started integration using the preprovisioned provider if needed.
 */
export const getGettingStarted = asyncWrapper<GetGettingStarted>(async (_, res) => {
    const { user, environment } = res.locals;

    const gettingStartedProgressResult = await gettingStartedService.getOrCreateProgressByUser(user, environment.id);

    if (gettingStartedProgressResult.isErr()) {
        report(gettingStartedProgressResult.error);
        res.status(500).send({
            error: {
                code: 'failed_to_get_or_create_getting_started_progress',
                message: gettingStartedProgressResult.error.message
            }
        });
        return;
    }

    res.status(200).send({
        data: gettingStartedProgressResult.value
    });
});
