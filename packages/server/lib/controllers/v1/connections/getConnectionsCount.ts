import { z } from 'zod';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { zodErrorToHTTP } from '@nangohq/utils';
import type { GetConnectionsCount } from '@nangohq/types';
import { envSchema } from '../../../helpers/validation.js';
import { connectionService } from '@nangohq/shared';

const queryStringValidation = z
    .object({
        env: envSchema
    })
    .strict();

export const getConnectionsCount = asyncWrapper<GetConnectionsCount>(async (req, res) => {
    const queryStringValues = queryStringValidation.safeParse(req.query);
    if (!queryStringValues.success) {
        res.status(400).send({
            error: { code: 'invalid_query_params', errors: zodErrorToHTTP(queryStringValues.error) }
        });
        return;
    }

    const { environment } = res.locals;

    const count = await connectionService.count({ environmentId: environment.id });
    if (count.isErr()) {
        res.status(200).send({ data: { total: 0, withAuthError: 0, withSyncError: 0, withError: 0 } });
        return;
    }

    res.status(200).send({
        data: count.value
    });
});
