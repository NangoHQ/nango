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
            const errType = (result.error as any).type ?? '';
            const errMsg = result.error.message ?? '';
            if (errType === 'duplicate_api_secret' || errMsg.includes('duplicate_api_secret')) {
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
};
