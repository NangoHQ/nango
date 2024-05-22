import { z } from 'zod';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { SearchOperations } from '@nangohq/types';
import { model, envs } from '@nangohq/logs';

const validation = z
    .object({
        limit: z.number().optional().default(100),
        states: z
            .array(z.enum(['all', 'waiting', 'running', 'success', 'failed', 'timeout', 'cancelled']))
            .optional()
            .default(['all'])
    })
    .strict();

export const searchOperations = asyncWrapper<SearchOperations>(async (req, res) => {
    if (!envs.NANGO_LOGS_ENABLED) {
        res.status(404).send({ error: { code: 'feature_disabled' } });
        return;
    }

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

    const env = res.locals['environment'];
    const body: SearchOperations['Body'] = val.data;
    const rawOps = await model.listOperations({ accountId: env.account_id, environmentId: env.id, limit: body.limit!, states: body.states });

    res.status(200).send({
        data: rawOps.items,
        pagination: { total: rawOps.count }
    });
});
