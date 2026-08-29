import * as z from 'zod';

import { isEnvironmentScopeSelector } from '@nangohq/authz';
import db from '@nangohq/database';
import { CustomerKeyError, customerKeyService } from '@nangohq/shared';
import { report, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapperWithEnvironment } from '../../../utils/asyncWrapper.js';

import type { ApiKeyScope, PatchApiKey } from '@nangohq/types';

const validationParams = z.object({
    keyId: z.coerce.number().int().positive()
});

const validationBody = z
    .object({
        scopes: z
            .array(z.custom<ApiKeyScope>(isEnvironmentScopeSelector, { error: (issue) => `Unknown scope: ${String(issue.input)}` }))
            .min(1)
            .optional(),
        display_name: z.string().min(1).max(255).optional()
    })
    .refine((data) => data.scopes || data.display_name, { message: 'At least one of scopes or display_name is required' });

export const patchApiKey = asyncWrapperWithEnvironment<PatchApiKey>(async (req, res) => {
    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const { keyId } = valParams.data;
    const { environment, account } = res.locals;

    const parsed = validationBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(parsed.error) } });
        return;
    }

    if (parsed.data.display_name) {
        const result = await customerKeyService.renameApiKey(db.knex, keyId, parsed.data.display_name, environment.id, account.id);
        if (result.isErr()) {
            if (result.error instanceof CustomerKeyError && result.error.code === 'duplicate_api_key') {
                res.status(409).send({ error: { code: 'conflict', message: 'A key with this name already exists' } });
            } else if (result.error instanceof CustomerKeyError && result.error.code === 'no_such_api_secret') {
                res.status(404).send({ error: { code: 'not_found', message: 'API key not found' } });
            } else {
                report(result.error);
                res.status(500).send({ error: { code: 'server_error', message: 'Failed to rename API key' } });
            }
            return;
        }
    }

    if (parsed.data.scopes) {
        const result = await customerKeyService.updateApiKeyScopes(db.knex, keyId, parsed.data.scopes, environment.id);
        if (result.isErr()) {
            if (result.error instanceof CustomerKeyError && result.error.code === 'no_such_api_secret') {
                res.status(404).send({ error: { code: 'not_found', message: 'API key not found' } });
            } else {
                report(result.error);
                res.status(500).send({ error: { code: 'server_error', message: 'Failed to update API key scopes' } });
            }
            return;
        }
    }

    res.status(200).send({ success: true });
});
