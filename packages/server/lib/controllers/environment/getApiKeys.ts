import * as z from 'zod';

import db from '@nangohq/database';
import { customerKeyService, environmentService } from '@nangohq/shared';
import { report, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { ApiKeyScope, GetPublicApiKeys } from '@nangohq/types';

const validationParams = z.object({ environmentUuid: z.uuid() }).strict();
const validationQuery = z.object({ display_name: z.string().min(1).max(255).optional() }).strict();

export const getPublicEnvironmentApiKeys = asyncWrapper<GetPublicApiKeys>(async (req, res) => {
    const params = validationParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(params.error) } });
        return;
    }

    const query = validationQuery.safeParse(req.query);
    if (!query.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(query.error) } });
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

    const keys = await customerKeyService.getApiKeysByEnvWithoutSecrets(db.knex, environment.id, query.data.display_name);
    if (keys.isErr()) {
        report(keys.error, { accountId: account.id, environmentId: environment.id });
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to retrieve API keys' } });
        return;
    }

    res.status(200).send({
        data: keys.value.map((key) => ({
            id: key.id,
            uuid: key.uuid,
            display_name: key.display_name,
            scopes: (key.scopes ?? []) as ApiKeyScope[],
            last_used_at: key.last_used_at?.toISOString() ?? null,
            created_at: key.created_at.toISOString()
        }))
    });
});
