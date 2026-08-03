import * as z from 'zod';

import db from '@nangohq/database';
import { customerKeyService, environmentService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { DeletePublicApiKey } from '@nangohq/types';

const validationBody = z
    .object({
        environment_id: z.coerce.number().int().positive(),
        key_id: z.coerce.number().int().positive()
    })
    .strict();

export const deletePublicApiKey = asyncWrapper<DeletePublicApiKey>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = validationBody.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const { environment_id: environmentId, key_id: keyId } = valBody.data;

    const account = res.locals.account;
    if (!account) {
        res.status(500).send({ error: { code: 'server_error', message: 'Account context is required' } });
        return;
    }

    const environment = await environmentService.getById(environmentId);
    if (!environment || environment.account_id !== account.id) {
        res.status(404).send({ error: { code: 'not_found', message: 'Environment not found' } });
        return;
    }

    const result = await customerKeyService.deleteCustomerKey(db.knex, keyId, environment.id);
    if (result.isErr()) {
        res.status(404).send({ error: { code: 'not_found', message: 'API key not found' } });
        return;
    }

    res.status(200).send({ success: true });
});
