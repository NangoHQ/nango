import * as z from 'zod';

import db from '@nangohq/database';
import { customerKeyService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { CreateApiKey } from '@nangohq/types';

const validationBody = z
    .object({
        display_name: z.string().min(1).max(255),
        scopes: z.array(z.string()).optional()
    })
    .strict();

export const createApiKey = asyncWrapper<CreateApiKey>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = validationBody.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const { environment, account } = res.locals;
    const { display_name: displayName, scopes } = valBody.data;

    const result = await customerKeyService.createApiKey(db.knex, {
        accountId: account.id,
        environmentId: environment.id,
        displayName,
        scopes: scopes ?? ['environment:*']
    });

    if (result.isErr()) {
        const isDuplicate = result.error.message.includes('duplicate');
        res.status(isDuplicate ? 409 : 500).send({
            error: {
                code: isDuplicate ? 'conflict' : 'server_error',
                message: isDuplicate ? 'A key with this name already exists' : 'Failed to create API key'
            }
        });
        return;
    }

    const key = result.value;
    res.status(200).send({
        data: {
            id: key.id,
            display_name: key.display_name,
            scopes: key.scopes ?? [],
            secret: key.secret,
            created_at: key.created_at.toISOString()
        }
    });
});
