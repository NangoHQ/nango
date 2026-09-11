import crypto from 'node:crypto';

import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { validateV0Signature } from './signature.js';

import type { InternalNango } from './internal-nango.js';
import type { WebhookResponse, ZoomWebhookPayload } from './types.js';
import type { Result } from '@nangohq/utils';

// https://developers.zoom.us/docs/api/webhooks/#unsuccessful-delivery
// Zoom retries a failed delivery up to 3 times, at +5min, +25min and +85min
// Their docs don't say whether a retry keeps the original x-zm-request-timestamp or gets a fresh one, so we assume
// the former (a plain re-POST of the queued request is the simpler thing to build) and set the
// tolerance past the last retry, with some room to spare.

const RETRY_TOLERANCE_SECONDS = 90 * 60;

export function verifyZoomWebhookAndHandleHandshake(
    nango: InternalNango,
    headers: Record<string, string>,
    body: ZoomWebhookPayload,
    rawBody: string
): Result<WebhookResponse> | null {
    const secret = nango.integration.custom?.['webhookSecret'];
    if (!secret) {
        return Err(new NangoError('webhook_invalid_secret', { reason: 'No webhook secret configured to validate this request' }));
    }

    const result = validateV0Signature({
        secret,
        headers,
        rawBody,
        signatureHeader: 'x-zm-signature',
        timestampHeader: 'x-zm-request-timestamp',
        toleranceSeconds: RETRY_TOLERANCE_SECONDS
    });
    if (result !== 'valid') {
        return Err(new NangoError(result === 'missing_headers' ? 'webhook_missing_signature' : 'webhook_invalid_signature'));
    }

    // https://developers.zoom.us/docs/api/webhooks/#endpoint-url-validation
    if (body.event === 'endpoint.url_validation') {
        const plainToken = body.payload?.plainToken;
        if (typeof plainToken !== 'string' || !plainToken) {
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
