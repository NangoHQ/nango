import * as z from 'zod';

import db from '@nangohq/database';
import { customerKeyService, environmentService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { sendCreateEnvironmentKeyError } from './sendCreateEnvironmentKeyError.js';

import type { ApiKeyScope, PostPublicApiKey } from '@nangohq/types';

const validationBody = z
    .object({
        environment_id: z.coerce.number().int().positive(),
        display_name: z.string().min(1).max(255)
    })
    .strict();

export const postPublicApiKey = asyncWrapper<PostPublicApiKey>(async (req, res) => {
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

    const { environment_id: environmentId, display_name: displayName } = valBody.data;

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

    const result = await customerKeyService.createApiKey(db.knex, {
        accountId: account.id,
        environmentId: environment.id,
        displayName,
        scopes: ['environment:*']
    });

    if (result.isErr()) {
        sendCreateEnvironmentKeyError(res, result.error);
        return;
    }

    const key = result.value;
    res.status(200).send({
        data: {
            id: key.id,
            display_name: key.display_name,
            scopes: (key.scopes ?? []) as ApiKeyScope[],
            secret: key.secret,
            created_at: key.created_at.toISOString()
        }
    });
});
