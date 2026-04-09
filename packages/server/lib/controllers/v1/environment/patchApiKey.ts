import * as z from 'zod';

import db from '@nangohq/database';
import { customerKeyService } from '@nangohq/shared';

import type { RequestLocals } from '../../../utils/express.js';
import type { Request, Response } from 'express';

const bodySchema = z.object({
    scopes: z.array(z.string().min(1)).min(1)
});

export const patchApiKey = async (req: Request, res: Response<any, RequestLocals>) => {
    const keyId = parseInt(req.params['keyId'] || '', 10);
    if (!keyId) {
        res.status(400).send({ error: { code: 'invalid_body', message: 'Missing keyId parameter' } });
        return;
    }

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: parsed.error.issues } });
        return;
    }

    const result = await customerKeyService.updateApiKeyScopes(db.knex, keyId, parsed.data.scopes);
    if (result.isErr()) {
        res.status(404).send({ error: { code: 'not_found', message: 'API key not found' } });
        return;
    }

    res.status(200).send({ success: true });
};
