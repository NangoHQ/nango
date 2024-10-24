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

    res.status(200).send({
        data: count
    });
});
