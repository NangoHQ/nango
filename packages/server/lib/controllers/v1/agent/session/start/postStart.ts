import { z } from 'zod';

import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../../utils/asyncWrapper.js';

import type { PostAgentSessionStart } from '@nangohq/types';

const bodySchema = z
    .object({
        prompt: z.string().min(1),
        integration_id: z.string().min(1),
        connection_id: z.string().optional()
    })
    .strict();

export const postAgentSessionStart = asyncWrapper<PostAgentSessionStart>((req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = bodySchema.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    res.status(501).send({ error: { code: 'server_error', message: 'Not implemented' } });
});
