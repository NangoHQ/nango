import * as z from 'zod';

import { isEnvironmentScopeSelector } from '@nangohq/authz';
import db from '@nangohq/database';
import { CustomerKeyError, customerKeyService, environmentService } from '@nangohq/shared';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { ApiKeyScope, PatchPublicApiKey } from '@nangohq/types';

const validationParams = z.object({ environmentUuid: z.uuid(), keyUuid: z.uuid() }).strict();

const validationBody = z
    .object({
        display_name: z.string().min(1).max(255).optional(),
        scopes: z
            .array(z.custom<ApiKeyScope>(isEnvironmentScopeSelector, { error: (issue) => `Unknown scope: ${String(issue.input)}` }))
            .nonempty('At least one scope is required when scopes are provided')
            .optional()
    })
    .strict()
    .refine((data) => data.display_name !== undefined || data.scopes !== undefined, { message: 'At least one of display_name or scopes is required' });

export const patchPublicEnvironmentApiKey = asyncWrapper<PatchPublicApiKey>(async (req, res) => {
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

    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const { environmentUuid, keyUuid } = valParams.data;
    const { display_name: displayName, scopes } = valBody.data;

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

    const key = await customerKeyService.search(db.knex, { type: 'environment', environmentId: environment.id, accountId: account.id, keyUuid });
    if (key.isErr()) {
        report(key.error, { accountId: account.id, environmentId: environment.id, keyUuid });
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to update API key' } });
        return;
    }
    const found = key.value[0];
    if (!found) {
        res.status(404).send({ error: { code: 'not_found', message: 'API key not found' } });
        return;
    }

    // Name and scopes change together or not at all, so a rejected rename never leaves new scopes behind.
    try {
        await db.knex.transaction(async (trx) => {
            if (displayName !== undefined) {
                (await customerKeyService.renameApiKey(trx, found.id, displayName, environment.id, account.id)).unwrap();
            }
            if (scopes !== undefined) {
                (await customerKeyService.updateApiKeyScopes(trx, found.id, scopes, environment.id)).unwrap();
            }
        });
    } catch (err) {
        if (err instanceof CustomerKeyError && err.code === 'duplicate_api_key') {
            res.status(409).send({ error: { code: 'conflict', message: 'A key with this name already exists' } });
        } else if (err instanceof CustomerKeyError && err.code === 'no_such_api_secret') {
            res.status(404).send({ error: { code: 'not_found', message: 'API key not found' } });
        } else {
            report(err, { accountId: account.id, environmentId: environment.id, keyUuid });
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to update API key' } });
        }
        return;
    }

    const { id, uuid, created_at, last_used_at } = found;
    res.status(200).send({
        data: {
            id,
            uuid,
            display_name: displayName ?? found.display_name,
            scopes: scopes ?? ((found.scopes ?? []) as ApiKeyScope[]),
            last_used_at: last_used_at?.toISOString() ?? null,
            created_at: created_at.toISOString()
        }
    });
});
