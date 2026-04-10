import * as z from 'zod';

import db from '@nangohq/database';
import { customerKeyService } from '@nangohq/shared';

import type { RequestLocals } from '../../../utils/express.js';
import type { Request, Response } from 'express';

const bodySchema = z
    .object({
        scopes: z.array(z.string().min(1)).min(1).optional(),
        display_name: z.string().min(1).max(255).optional()
    })
    .refine((data) => data.scopes || data.display_name, { message: 'At least one of scopes or display_name is required' });

export const patchApiKey = async (req: Request, res: Response<any, RequestLocals>) => {
    const keyId = parseInt(req.params['keyId'] || '', 10);
    if (!keyId) {
        res.status(400).send({ error: { code: 'invalid_body', message: 'Missing keyId parameter' } });
        return;
    }

    const environment = res.locals['environment']!;
    const account = res.locals['account']!;

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: parsed.error.issues } });
        return;
    }

    if (parsed.data.display_name) {
        const result = await customerKeyService.renameApiKey(db.knex, keyId, parsed.data.display_name, environment.id, account.id);
        if (result.isErr()) {
            const msg = result.error.message.includes('duplicate') ? 'A key with this name already exists' : 'API key not found';
            res.status(result.error.message.includes('duplicate') ? 409 : 404).send({
                error: { code: result.error.message.includes('duplicate') ? 'conflict' : 'not_found', message: msg }
            });
            return;
        }
    }

    if (parsed.data.scopes) {
        const result = await customerKeyService.updateApiKeyScopes(db.knex, keyId, parsed.data.scopes);
        if (result.isErr()) {
            res.status(404).send({ error: { code: 'not_found', message: 'API key not found' } });
            return;
        }
    }

    res.status(200).send({ success: true });
};
