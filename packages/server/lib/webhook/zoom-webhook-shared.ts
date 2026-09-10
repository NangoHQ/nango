import crypto from 'node:crypto';

import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { validateV0Signature } from './signature.js';

import type { InternalNango } from './internal-nango.js';
import type { WebhookResponse, ZoomWebhookPayload } from './types.js';
import type { Result } from '@nangohq/utils';

export async function verifyZoomWebhookAndHandleHandshake(
    nango: InternalNango,
    headers: Record<string, string>,
    body: ZoomWebhookPayload,
    rawBody: string,
    connectionIdentifierValue: string | undefined
): Promise<Result<WebhookResponse> | null> {
    let secret = nango.integration.custom?.['webhookSecret'];
    if (!secret && connectionIdentifierValue) {
        const connection = await nango.getConnectionForWebhook(connectionIdentifierValue);
        const connectionSecret = connection?.metadata?.['webhookSecret'];
        if (connectionSecret != null && typeof connectionSecret !== 'string') {
            return Err(new NangoError('webhook_invalid_secret', { reason: 'Invalid webhook secret' }));
        }
        secret = connectionSecret ?? undefined;
    }

    if (!secret) {
        return Err(new NangoError('webhook_invalid_secret', { reason: 'No webhook secret configured to validate this request' }));
    }

    const result = validateV0Signature({ secret, headers, rawBody, signatureHeader: 'x-zm-signature', timestampHeader: 'x-zm-request-timestamp' });
    if (result !== 'valid') {
        return Err(new NangoError(result === 'missing_headers' ? 'webhook_missing_signature' : 'webhook_invalid_signature'));
    }

    // https://developers.zoom.us/docs/api/webhooks/#endpoint-url-validation
    if (body.event === 'endpoint.url_validation') {
        const plainToken = body.payload?.plainToken;
        if (!plainToken) {
            return Err(new NangoError('webhook_invalid_body'));
        }

        const encryptedToken = crypto.createHmac('sha256', secret).update(plainToken).digest('hex');

        return Ok({
            content: { plainToken, encryptedToken },
            statusCode: 200
        });
    }

    return null;
}
