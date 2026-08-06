import * as z from 'zod';

import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { handleDeleteApiKey } from '../../shared/environments/deleteApiKey.js';

import type { DeleteApiKey } from '@nangohq/types';

const validationParams = z.object({
    keyId: z.coerce.number().int().positive()
});

export const deleteApiKey = asyncWrapper<DeleteApiKey>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const { keyId } = valParams.data;
    const { environment } = res.locals;

    await handleDeleteApiKey({ res, environmentId: environment.id, keyId });
});
