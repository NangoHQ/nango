import * as z from 'zod';

import { accountService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { PostOnboardingHearAboutUs } from '@nangohq/types';

const HEAR_ABOUT_SOURCES = [
    'my_team_already_using',
    'recommended',
    'search_engine',
    'llm_search',
    'social_media',
    'dont_remember',
    'other',
    'skipped'
] as const;

const validation = z
    .object({
        source: z.enum(HEAR_ABOUT_SOURCES)
    })
    .strict();

export const postOnboardingHearAboutUs = asyncWrapper<PostOnboardingHearAboutUs>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: false });
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

    const account = res.locals.account;
    const hasSetFoundUs = !(account.found_us === null || account.found_us === '');
    if (hasSetFoundUs) {
        res.status(403).send({ error: { code: 'forbidden', message: 'Not allowed to set hear-about-us for this account.' } });
        return;
    }

    const canSetHearAboutUs = await accountService.shouldShowHearAboutUs(account);
    if (!canSetHearAboutUs) {
        res.status(403).send({ error: { code: 'forbidden', message: 'Only the first workspace user can answer this question.' } });
        return;
    }

    await accountService.updateAccount({ id: account.id, foundUs: val.data.source });
    res.status(200).send({
        data: {
            success: true
        }
    });
});
