import { z } from 'zod';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { PostInsights } from '@nangohq/types';
import { envs, modelOperations } from '@nangohq/logs';

const validation = z
    .object({
        type: z.enum(['sync:run', 'action', 'proxy', 'webhook:incoming'])
    })
    .strict();

export const postInsights = asyncWrapper<PostInsights>(async (req, res) => {
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
    const body: PostInsights['Body'] = val.data;
    const insights = await modelOperations.retrieveInsights({
        accountId: env.account_id,
        environmentId: env.id,
        type: body.type
    });

    res.status(200).send({
        data: {
            histogram: insights.items
        }
    });
});
