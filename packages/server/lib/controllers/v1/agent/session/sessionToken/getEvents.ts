import { z } from 'zod';

import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../../utils/asyncWrapper.js';

import type { GetAgentSessionEvents } from '@nangohq/types';

const paramsSchema = z
    .object({
        sessionToken: z.string().min(1)
    })
    .strict();

export const getAgentSessionEvents = asyncWrapper<GetAgentSessionEvents>((req, res) => {
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

    res.status(501).send({ error: { code: 'server_error', message: 'Not implemented' } });
});
