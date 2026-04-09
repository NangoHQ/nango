import db from '@nangohq/database';
import { customerKeyService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { DeleteApiKey } from '@nangohq/types';

export const deleteApiKey = asyncWrapper<DeleteApiKey>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const keyId = Number(req.params['keyId']);
    if (isNaN(keyId)) {
        res.status(400).send({ error: { code: 'invalid_query_params', message: 'keyId must be a number' } });
        return;
    }

    const result = await customerKeyService.deleteCustomerKey(db.knex, keyId);
    if (result.isErr()) {
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to delete API key' } });
        return;
    }

    res.status(200).send({ success: true });
});
