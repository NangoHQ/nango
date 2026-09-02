import * as z from 'zod';

import db from '@nangohq/database';
import { CustomerKeyError, customerKeyService } from '@nangohq/shared';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { AccountApiKeyScope, CreateAccountApiKey } from '@nangohq/types';

const validationBody = z
    .object({
        display_name: z.string().min(1).max(255)
    })
    .strict();

export const createAccountApiKey = asyncWrapper<CreateAccountApiKey>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: false });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = validationBody.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const result = await customerKeyService.createAccountApiKey(db.knex, {
        accountId: res.locals.account.id,
        displayName: valBody.data.display_name,
        scopes: ['account:*']
    });

    if (result.isErr()) {
        if (result.error instanceof CustomerKeyError && result.error.code === 'duplicate_api_key') {
            res.status(409).send({ error: { code: 'conflict', message: 'An Account API key with this name already exists' } });
        } else if (result.error instanceof CustomerKeyError && result.error.code === 'resource_capped') {
            res.status(400).send({ error: { code: 'resource_capped', message: 'Maximum number of account API keys reached' } });
        } else {
            report(result.error);
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to create account API key' } });
        }
        return;
    }

    const key = result.value;
    res.status(200).send({
        data: {
            id: key.id,
            uuid: key.uuid,
            display_name: key.display_name,
            scopes: (key.scopes ?? []) as AccountApiKeyScope[],
            secret: key.secret,
            created_at: key.created_at.toISOString()
        }
    });
});
