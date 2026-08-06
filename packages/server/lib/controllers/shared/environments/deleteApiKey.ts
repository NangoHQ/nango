import db from '@nangohq/database';
import { customerKeyService } from '@nangohq/shared';

import type { RequestLocals } from '../../../utils/express.js';
import type { DeleteApiKey, DeletePublicApiKey } from '@nangohq/types';
import type { Response } from 'express';

export async function handleDeleteApiKey({
    res,
    environmentId,
    keyId
}: {
    res: Response<DeleteApiKey['Reply'] | DeletePublicApiKey['Reply'], Required<RequestLocals>>;
    environmentId: number;
    keyId: number;
}): Promise<void> {
    const result = await customerKeyService.deleteCustomerKey(db.knex, keyId, environmentId);
    if (result.isErr()) {
        res.status(404).send({ error: { code: 'not_found', message: 'API key not found' } });
        return;
    }

    res.status(200).send({ success: true });
}
