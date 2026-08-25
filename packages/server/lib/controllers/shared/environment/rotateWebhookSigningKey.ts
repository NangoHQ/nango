import db from '@nangohq/database';
import { CustomerKeyError, customerKeyService } from '@nangohq/shared';
import { report } from '@nangohq/utils';

import type { RequestLocalsWithEnvironment } from '../../../utils/express.js';
import type { PostPublicRotateWebhookSigningKey, PostRotateWebhookSigningKey } from '@nangohq/types';
import type { Response } from 'express';

export async function handleRotateWebhookSigningKey({
    res,
    environmentId
}: {
    res: Response<PostRotateWebhookSigningKey['Reply'] | PostPublicRotateWebhookSigningKey['Reply'], RequestLocalsWithEnvironment>;
    environmentId: number;
}): Promise<void> {
    const rotated = await customerKeyService.rotateWebhookSigningKey(db.knex, environmentId);
    if (rotated.isErr()) {
        const err = rotated.error;
        if (err instanceof CustomerKeyError && err.code === 'no_webhook_signing_key') {
            res.status(404).send({ error: { code: 'not_found', message: 'This environment has no webhook signing key' } });
            return;
        }
        if (err instanceof CustomerKeyError && err.code === 'multiple_webhook_signing_keys') {
            res.status(409).send({
                error: { code: 'multiple_webhook_signing_keys', message: 'This environment has more than one webhook signing key, contact support' }
            });
            return;
        }
        report(err, { environmentId });
        res.status(500).send({ error: { code: 'rotation_failed', message: 'Failed to rotate the webhook signing key' } });
        return;
    }

    res.status(200).send({ data: { webhook_signing_key: rotated.value } });
}
