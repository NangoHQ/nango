import * as z from 'zod';

import db from '@nangohq/database';
import { customerKeyService } from '@nangohq/shared';
import { apiKeyScopes, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { PatchApiKey } from '@nangohq/types';

const validationParams = z.object({
    keyId: z.coerce.number().int().positive()
});

const validationBody = z
    .object({
        scopes: z.array(z.enum(apiKeyScopes)).min(1).optional(),
        display_name: z.string().min(1).max(255).optional()
    })
    .refine((data) => data.scopes || data.display_name, { message: 'At least one of scopes or display_name is required' });

export const patchApiKey = asyncWrapper<PatchApiKey>(async (req, res) => {
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
            const { type: errType = '', message: errMsg = '' } = result.error as { type?: string; message?: string };
            if (errType === 'duplicate_api_key' || errMsg.includes('duplicate_api_key')) {
                res.status(409).send({ error: { code: 'conflict', message: 'A key with this name already exists' } });
            } else {
                res.status(404).send({ error: { code: 'not_found', message: 'API key not found' } });
            }
            return;
        }
    }

    if (parsed.data.scopes) {
        const result = await customerKeyService.updateApiKeyScopes(db.knex, keyId, parsed.data.scopes, environment.id);
        if (result.isErr()) {
            res.status(404).send({ error: { code: 'not_found', message: 'API key not found' } });
            return;
        }
    }

    res.status(200).send({ success: true });
});
