import { z } from 'zod';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import type { SearchMessages } from '@nangohq/types';
import { model, envs, operationIdRegex } from '@nangohq/logs';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

const validation = z
    .object({
        operationId: operationIdRegex,
        limit: z.number().max(500).optional().default(100),
        search: z.string().max(100).optional(),
        states: z
            .array(z.enum(['all', 'waiting', 'running', 'success', 'failed', 'timeout', 'cancelled']))
            .max(10)
            .optional()
            .default(['all']),
        cursorBefore: z.string().or(z.null()).optional(),
        cursorAfter: z.string().or(z.null()).optional()
    })
    .strict();

export const searchMessages = asyncWrapper<SearchMessages>(async (req, res) => {
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

    const { environment, account } = res.locals;

    // Manually ensure that `operationId` belongs to the account for now
    // Because not all the logs have accountId/environmentId
    try {
        const operation = await model.getOperation({ id: val.data.operationId });
        if (operation.accountId !== account.id || operation.environmentId !== environment.id) {
            res.status(404).send({ error: { code: 'not_found' } });
            return;
        }
    } catch (err) {
        if (err instanceof model.ResponseError && err.statusCode === 404) {
            res.status(404).send({ error: { code: 'not_found' } });
            return;
        }
        throw err;
    }

    const body: SearchMessages['Body'] = val.data;
    const rawOps = await model.listMessages({
        parentId: body.operationId,
        limit: body.limit!,
        states: body.states,
        search: body.search,
        cursorBefore: body.cursorBefore,
        cursorAfter: body.cursorAfter
    });

    res.status(200).send({
        data: rawOps.items,
        pagination: { total: rawOps.count, cursorBefore: rawOps.cursorBefore, cursorAfter: rawOps.cursorAfter }
    });
});
