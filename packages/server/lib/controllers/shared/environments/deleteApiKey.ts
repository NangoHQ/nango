import db from '@nangohq/database';
import { CustomerKeyError, customerKeyService } from '@nangohq/shared';
import { report } from '@nangohq/utils';

import type { RequestLocals } from '../../../utils/express.js';
import type { DeleteApiKey, DeletePublicApiKey } from '@nangohq/types';
import type { Response } from 'express';

export async function handleDeleteApiKey({
    res,
    environmentId,
    keyId
}: {
    res: Response<DeleteApiKey['Reply'] | DeletePublicApiKey['Reply'], RequestLocals>;
    environmentId: number;
    keyId: number;
}): Promise<void> {
    const result = await customerKeyService.deleteCustomerKey(db.knex, keyId, environmentId);
    if (result.isErr()) {
        if (result.error instanceof CustomerKeyError && result.error.code === 'no_such_api_secret') {
            res.status(404).send({ error: { code: 'not_found', message: 'API key not found' } });
        } else {
            report(result.error);
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to delete API key' } });
        }
        return;
    }

    res.status(200).send({ success: true });
}
