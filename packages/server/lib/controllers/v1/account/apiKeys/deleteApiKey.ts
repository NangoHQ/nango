import * as z from 'zod';

import db from '@nangohq/database';
import { CustomerKeyError, customerKeyService } from '@nangohq/shared';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { DeleteAccountApiKey } from '@nangohq/types';

const validationParams = z.object({
    keyId: z.coerce.number().int().positive()
});

export const deleteAccountApiKey = asyncWrapper<DeleteAccountApiKey>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: false });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const result = await customerKeyService.deleteAccountApiKey(db.knex, valParams.data.keyId, res.locals.account.id);
    if (result.isErr()) {
        if (result.error instanceof CustomerKeyError && result.error.code === 'no_such_api_secret') {
            res.status(404).send({ error: { code: 'not_found', message: 'Account API key not found' } });
        } else {
            report(result.error);
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to delete account API key' } });
        }
        return;
    }

    res.status(200).send({ success: true });
});
