import { z } from 'zod';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { GetOperation } from '@nangohq/types';
import { model, envs, operationIdRegex } from '@nangohq/logs';

const validation = z
    .object({
        operationId: operationIdRegex
    })
    .strict();

export const getOperation = asyncWrapper<GetOperation>(async (req, res) => {
    if (!envs.NANGO_LOGS_ENABLED) {
        res.status(404).send({ error: { code: 'feature_disabled' } });
        return;
    }

    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = validation.safeParse(req.params);
    if (!val.success) {
        res.status(400).send({
            error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(val.error) }
        });
        return;
    }

    const { environment, account } = res.locals;
    try {
        const operation = await model.getOperation({ id: val.data.operationId });
        if (operation.accountId !== account.id || operation.environmentId !== environment.id || !operation.operation) {
            res.status(404).send({ error: { code: 'not_found' } });
            return;
        }

        res.status(200).send({ data: operation });
    } catch (err) {
        if (err instanceof model.ResponseError && err.statusCode === 404) {
            res.status(404).send({ error: { code: 'not_found' } });
            return;
        }
        throw err;
    }
});
