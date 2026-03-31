import { z } from 'zod';

import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { PostRemoteFunctionDryrun } from '@nangohq/types';

const bodySchema = z
    .object({
        integration_id: z.string().min(1),
        function_name: z.string().min(1),
        function_type: z.enum(['action', 'sync']),
        code: z.string().min(1),
        connection_id: z.string().min(1),
        input: z.unknown().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
        checkpoint: z.record(z.string(), z.unknown()).optional(),
        last_sync_date: z.string().datetime().optional()
    })
    .strict();

export const postRemoteFunctionDryrun = asyncWrapper<PostRemoteFunctionDryrun>((req, res) => {
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
