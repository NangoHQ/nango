import * as z from 'zod';

import { environmentService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { handleDeleteApiKey } from '../shared/environments/deleteApiKey.js';

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

    const environment = await environmentService.getByIdWithoutSecrets(environmentId, account.id);
    if (!environment) {
        res.status(404).send({ error: { code: 'not_found', message: 'Environment not found' } });
        return;
    }

    await handleDeleteApiKey({ res, environmentId: environment.id, keyId });
});
