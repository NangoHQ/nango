import * as z from 'zod';

import db from '@nangohq/database';
import { customerKeyService } from '@nangohq/shared';
import { apiKeyScopes, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { ApiKeyScope, CreateApiKey } from '@nangohq/types';

const validationBody = z
    .object({
        display_name: z.string().min(1).max(255),
        scopes: z.array(z.enum(apiKeyScopes)).nonempty('At least one scope is required when scopes are provided').optional()
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
        const { type: errType = '', message: errMsg = '' } = result.error as { type?: string; message?: string };
        if (errType === 'duplicate_api_key' || errMsg.includes('duplicate_api_key')) {
            res.status(409).send({ error: { code: 'conflict', message: 'A key with this name already exists' } });
        } else if (errType === 'resource_capped' || errMsg.includes('resource_capped')) {
            res.status(400).send({ error: { code: 'resource_capped', message: 'Maximum number of API keys per environment reached' } });
        } else {
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to create API key' } });
        }
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
