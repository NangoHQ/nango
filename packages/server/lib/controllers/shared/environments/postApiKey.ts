import db from '@nangohq/database';
import { CustomerKeyError, customerKeyService } from '@nangohq/shared';
import { report } from '@nangohq/utils';

import type { RequestLocals } from '../../../utils/express.js';
import type { ApiKeyScope, CreateApiKey, PostPublicApiKey } from '@nangohq/types';
import type { Response } from 'express';

type PostApiKeyResponse = Response<CreateApiKey['Reply'] | PostPublicApiKey['Reply'], RequestLocals>;

function sendCreateApiKeyError(res: PostApiKeyResponse, error: Error): void {
    if (error instanceof CustomerKeyError && error.code === 'duplicate_api_key') {
        res.status(409).send({ error: { code: 'conflict', message: 'A key with this name already exists' } });
    } else if (error instanceof CustomerKeyError && error.code === 'resource_capped') {
        res.status(400).send({ error: { code: 'resource_capped', message: 'Maximum number of API keys per environment reached' } });
    } else {
        report(error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to create API key' } });
    }
}

export async function handleCreateApiKey({
    res,
    accountId,
    environmentId,
    displayName,
    scopes
}: {
    res: PostApiKeyResponse;
    accountId: number;
    environmentId: number;
    displayName: string;
    scopes?: ApiKeyScope[] | undefined;
}): Promise<void> {
    const result = await customerKeyService.createApiKey(db.knex, {
        accountId,
        environmentId,
        displayName,
        scopes: scopes ?? ['environment:*']
    });

    if (result.isErr()) {
        sendCreateApiKeyError(res, result.error);
        return;
    }

    const key = result.value;
    res.status(200).send({
        data: {
            id: key.id,
            uuid: key.uuid,
            display_name: key.display_name,
            scopes: (key.scopes ?? []) as ApiKeyScope[],
            secret: key.secret,
            created_at: key.created_at.toISOString()
        }
    });
}
