import * as z from 'zod';

import db from '@nangohq/database';
import { CustomerKeyError, customerKeyService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { PostRotateWebhookSigningKey } from '@nangohq/types';

const paramsValidation = z
    .object({
        environmentId: z.coerce.number().positive()
    })
    .strict();

export const postRotateWebhookSigningKey = asyncWrapper<PostRotateWebhookSigningKey>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const params = paramsValidation.safeParse(req.params);
    if (!params.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(params.error) } });
        return;
    }

    const rotated = await customerKeyService.rotateWebhookSigningKey(db.knex, params.data.environmentId);
    if (rotated.isErr()) {
        const err = rotated.error;
        if (err instanceof CustomerKeyError && err.code === 'no_webhook_signing_key') {
            res.status(404).send({ error: { code: 'not_found', message: `No webhook signing key for environment ${params.data.environmentId}` } });
            return;
        }
        if (err instanceof CustomerKeyError && err.code === 'multiple_webhook_signing_keys') {
            res.status(409).send({
                error: {
                    code: 'multiple_webhook_signing_keys',
                    message: `Environment ${params.data.environmentId} has more than one webhook signing key, resolve manually`
                }
            });
            return;
        }
        res.status(500).send({ error: { code: 'rotation_failed', message: err.message } });
        return;
    }

    res.status(200).send({ data: { webhook_signing_key: rotated.value } });
});
