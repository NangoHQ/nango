import * as z from 'zod';

import db from '@nangohq/database';
import { customerKeyService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';

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

    const result = await customerKeyService.deleteCustomerKey(db.knex, keyId, environment.id);
    if (result.isErr()) {
        res.status(404).send({ error: { code: 'not_found', message: 'API key not found' } });
        return;
    }

    res.status(200).send({ success: true });
});
