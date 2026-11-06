import * as z from 'zod';

import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapperWithEnvironment } from '../../utils/asyncWrapper.js';
import { handleRotateWebhookSigningKey } from '../shared/environment/rotateWebhookSigningKey.js';

import type { PostPublicRotateWebhookSigningKey } from '@nangohq/types';

const validationBody = z
    .object({
        webhook_signing_key: z
            .uuid({ version: 'v4' })
            .transform((value) => value.toLowerCase())
            .optional()
    })
    .strict()
    .optional();

export const postPublicRotateWebhookSigningKey = asyncWrapperWithEnvironment<PostPublicRotateWebhookSigningKey>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const body = validationBody.safeParse(req.body);
    if (!body.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(body.error) } });
        return;
    }

    await handleRotateWebhookSigningKey({ res, environmentId: res.locals.environment.id, signingKey: body.data?.webhook_signing_key });
});
