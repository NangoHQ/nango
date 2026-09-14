import * as z from 'zod';

import db from '@nangohq/database';
import { customerKeyService, environmentService } from '@nangohq/shared';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { ApiKeyScope, GetPublicApiKey } from '@nangohq/types';

const validationParams = z.object({ environmentUuid: z.uuid(), keyUuid: z.uuid() }).strict();

export const getPublicEnvironmentApiKey = asyncWrapper<GetPublicApiKey>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const params = validationParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(params.error) } });
        return;
    }

    const account = res.locals.account;
    if (!account) {
        res.status(500).send({ error: { code: 'server_error', message: 'Account context is required' } });
        return;
    }

    const environment = await environmentService.getByUuidWithoutSecrets(params.data.environmentUuid, account.id);
    if (!environment) {
        res.status(404).send({ error: { code: 'not_found', message: 'Environment not found' } });
        return;
    }

    const key = await customerKeyService.getApiKeyByUuid(db.knex, params.data.keyUuid, environment.id, account.id);
    if (key.isErr()) {
        report(key.error, { accountId: account.id, environmentId: environment.id, keyUuid: params.data.keyUuid });
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to retrieve API key' } });
        return;
    }
    if (!key.value) {
        res.status(404).send({ error: { code: 'not_found', message: 'API key not found' } });
        return;
    }

    const { id, uuid, display_name, scopes, secret, last_used_at, created_at } = key.value;
    res.status(200).send({
        data: {
            id,
            uuid,
            display_name,
            scopes: (scopes ?? []) as ApiKeyScope[],
            secret,
            last_used_at: last_used_at?.toISOString() ?? null,
            created_at: created_at.toISOString()
        }
    });
});
