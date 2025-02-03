import { z } from 'zod';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import type { DBEnvironment, PatchEnvironment } from '@nangohq/types';
import { environmentService } from '@nangohq/shared';
import { environmentToApi } from '../../../formatters/environment.js';

const validationBody = z
    .object({
        slack_notifications: z.boolean().optional()
    })
    .strict();

export const patchEnvironment = asyncWrapper<PatchEnvironment>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = validationBody.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const body: PatchEnvironment['Body'] = valBody.data;
    const { environment } = res.locals;

    const data: Partial<DBEnvironment> = {};
    if (body.slack_notifications) {
        data.slack_notifications = body.slack_notifications;
    }

    const updated = await environmentService.update({ accountId: environment.account_id, environmentId: environment.id, data });
    if (!updated) {
        res.status(500).send({ error: { code: 'server_error', message: 'failed to update environment' } });
        return;
    }

    res.status(200).send({ data: environmentToApi(updated) });
});
