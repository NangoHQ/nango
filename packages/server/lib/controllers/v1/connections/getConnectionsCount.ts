import * as z from 'zod';

import { connectionService } from '@nangohq/shared';
import { zodErrorToHTTP } from '@nangohq/utils';

import { envSchema } from '../../../helpers/validation.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { GetConnectionsCount } from '@nangohq/types';

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
