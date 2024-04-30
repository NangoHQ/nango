import { z } from 'zod';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '../../../utils/validation.js';
import type { ListOperations } from '@nangohq/types';
import { getUserAccountAndEnvironmentFromSession } from '../../../utils/utils.js';
import { errorManager } from '@nangohq/shared';
import { model } from '@nangohq/logs';

const validation = z
    .object({
        limit: z.number().optional().default(100)
    })
    .strict();

export const listOperations = asyncWrapper<ListOperations>(async (req, res) => {
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

    const { success: sessionSuccess, error: sessionError, response: accUserEnv } = await getUserAccountAndEnvironmentFromSession(req);
    if (!sessionSuccess || !accUserEnv) {
        // TODO: type those errors
        errorManager.errResFromNangoErr(res, sessionError);
        return;
    }

    const body = val.data;
    const rawOps = await model.listOperations({ accountId: accUserEnv.account.id, environmentId: accUserEnv.environment.id, limit: body.limit });

    res.status(200).send({ data: rawOps.items });
});
