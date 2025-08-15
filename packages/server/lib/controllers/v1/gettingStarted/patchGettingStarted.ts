import * as z from 'zod';

import { gettingStartedService } from '@nangohq/shared';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { PatchGettingStarted } from '@nangohq/types';

const validationBody = z
    .object({
        connection_id: z.string().optional().nullable(),
        step: z.number().int().nonnegative().optional(),
        complete: z.boolean().optional()
    })
    .strict();

export const patchGettingStarted = asyncWrapper<PatchGettingStarted>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = validationBody.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const body: PatchGettingStarted['Body'] = valBody.data;
    const { user } = res.locals;

    const updated = await gettingStartedService.patchProgressByUser(user, body);
    if (updated.isErr()) {
        if (updated.error.message === 'connection_not_found' || updated.error.message === 'getting_started_progress_not_found') {
            res.status(404).send({ error: { code: updated.error.message, message: updated.error.message } });
            return;
        }
        report(updated.error);
        res.status(500).send({ error: { code: 'failed_to_update_getting_started_progress', message: updated.error.message } });
        return;
    }

    res.status(204).send();
});
