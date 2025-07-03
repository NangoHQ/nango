import crypto from 'node:crypto';

import { zodErrorToHTTP } from '@nangohq/utils';

import type { RequestLocals } from './express.js';
import type { LogContext } from '@nangohq/logs';
import type { ApiError, ConnectionResponseSuccess, ConnectionResponseSuccessWithSignature, IntegrationConfig } from '@nangohq/types';
import type { Response } from 'express';

export async function isIntegrationAllowed({
    config,
    logCtx,
    res
}: {
    config: IntegrationConfig;
    logCtx: LogContext;
    res: Response<ApiError<'integration_not_allowed'>, Required<RequestLocals>>;
}): Promise<boolean> {
    if (res.locals['authType'] !== 'connectSession') {
        return true;
    }

    const session = res.locals['connectSession'];
    if (!session.allowedIntegrations || session.allowedIntegrations.includes(config.unique_key)) {
        return true;
    }

    void logCtx.error('Integration not allowed by this token', { integration: config.unique_key, allowed: session.allowedIntegrations });
    await logCtx.failed();
    res.status(400).send({ error: { code: 'integration_not_allowed' } });
    return false;
}

export function errorRestrictConnectionId(res: Response<ApiError<'invalid_query_params'>>): void {
    res.status(400).send({
        error: {
            code: 'invalid_query_params',
            errors: zodErrorToHTTP({
                issues: [{ code: 'custom', path: ['connection_id'], message: 'connection_id is forbidden when using session token' }]
            })
        }
    });
}

export function connectionResponseWithSignature({
    connectionId,
    providerConfigKey,
    privateKey,
    keyForSignature
}: {
    connectionId: string;
    providerConfigKey: string;
    privateKey?: string | undefined;
    keyForSignature?: string | undefined;
}): ConnectionResponseSuccess | ConnectionResponseSuccessWithSignature {
    const payload: ConnectionResponseSuccess = {
        connectionId,
        providerConfigKey,
        privateKey
    };

    // Signature only exists for connect sessions because the others are created with public keys
    if (!keyForSignature) {
        return payload;
    }

    const payloadString = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', keyForSignature).update(payloadString).digest('hex');

    // We send the payload and the signature to the client so that the client can verify the payload
    // This is a security measure to prevent the client from tampering with the payload
    // We put the signed data into it's own payload because for some languages removing the signature will modify the payload in a way that will break the signature verification
    return {
        ...payload,
        signature,
        signedPayload: payload
    } satisfies ConnectionResponseSuccessWithSignature;
}
