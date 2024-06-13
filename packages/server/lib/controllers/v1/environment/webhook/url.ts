import { z } from 'zod';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import type { UpdatePrimaryUrl, UpdateSecondaryUrl } from '@nangohq/types';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { externalWebhookService } from '@nangohq/shared';

const validation = z
    .object({
        url: z.string()
    })
    .strict();

export const updatePrimaryUrl = asyncWrapper<UpdatePrimaryUrl>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
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

    const { environment } = res.locals;

    const { data } = val;

    await externalWebhookService.updatePrimaryUrl(environment.id, data.url);

    res.send(data);
});

export const updateSecondaryUrl = asyncWrapper<UpdateSecondaryUrl>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
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

    const { environment } = res.locals;

    const { data } = val;

    await externalWebhookService.updateSecondaryUrl(environment.id, data.url);

    res.send(data);
});
