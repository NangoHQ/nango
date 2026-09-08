import * as z from 'zod';

import db from '@nangohq/database';
import { customerKeyService, environmentService } from '@nangohq/shared';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { handleDeleteApiKey } from '../shared/environments/deleteApiKey.js';

import type { DeletePublicApiKey } from '@nangohq/types';

const validationParams = z
    .object({
        environmentUuid: z.uuid(),
        keyUuid: z.uuid()
    })
    .strict();

export const deletePublicEnvironmentApiKey = asyncWrapper<DeletePublicApiKey>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const { environmentUuid, keyUuid } = valParams.data;

    const account = res.locals.account;
    if (!account) {
        res.status(500).send({ error: { code: 'server_error', message: 'Account context is required' } });
        return;
    }

    const environment = await environmentService.getByUuidWithoutSecrets(environmentUuid, account.id);
    if (!environment) {
        res.status(404).send({ error: { code: 'not_found', message: 'Environment not found' } });
        return;
    }

    const key = await customerKeyService.getApiKeyByUuid(db.knex, keyUuid, environment.id, account.id);
    if (key.isErr()) {
        report(key.error, { accountId: account.id, environmentId: environment.id });
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to delete API key' } });
        return;
    }
    if (!key.value) {
        res.status(404).send({ error: { code: 'not_found', message: 'API key not found' } });
        return;
    }

    await handleDeleteApiKey({ res, environmentId: environment.id, keyId: key.value.id });
});
