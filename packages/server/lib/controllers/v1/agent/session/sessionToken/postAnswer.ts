import { z } from 'zod';

import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../../utils/asyncWrapper.js';

import type { PostAgentSessionAnswer } from '@nangohq/types';

const paramsSchema = z
    .object({
        sessionToken: z.string().min(1)
    })
    .strict();

const bodySchema = z
    .object({
        question_id: z.string().min(1),
        response: z.string().min(1)
    })
    .strict();

export const postAgentSessionAnswer = asyncWrapper<PostAgentSessionAnswer>((req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valParams = paramsSchema.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const valBody = bodySchema.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    res.status(501).send({ error: { code: 'server_error', message: 'Not implemented' } });
});
