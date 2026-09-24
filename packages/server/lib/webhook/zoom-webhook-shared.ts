import crypto from 'node:crypto';

import { getKVStore } from '@nangohq/kvstore';
import { NangoError } from '@nangohq/shared';
import { Err, getLogger, Ok } from '@nangohq/utils';

import { validateV0Signature } from './signature.js';

import type { InternalNango } from './internal-nango.js';
import type { WebhookResponse, ZoomWebhookPayload } from './types.js';
import type { Result } from '@nangohq/utils';

const logger = getLogger('Webhook.Zoom');

// Zoom retries a failed delivery up to 3 times (+5min/+25min/+85min). Confirmed live: each retry
// is freshly signed with a new timestamp, not a replay -- so the default tolerance is enough, and
// x-zm-request-id (stable across retries) is what we dedupe on below instead.

const DEDUPE_TTL_MS = 90 * 60 * 1000; // covers the full +5min/+25min/+85min retry schedule, with room to spare

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
        timestampHeader: 'x-zm-request-timestamp'
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

export interface ZoomWebhookDedupeClaim {
    key: string;
    token: string;
}

export async function claimZoomWebhookDedupe(nango: InternalNango, requestId: string | undefined): Promise<ZoomWebhookDedupeClaim | null | undefined> {
    if (!requestId) {
        return undefined;
    }

    const key = `zoom:webhook:dedupe:${nango.integration.id}:${requestId}`;
    const token = crypto.randomUUID();

    try {
        const store = await getKVStore();
        await store.set(key, token, { canOverride: false, ttlMs: DEDUPE_TTL_MS });
        return { key, token };
    } catch (err) {
        if (err instanceof Error && err.message === 'set_key_already_exists') {
            return null;
        }
        logger.error('zoom webhook dedupe claim failed', { error: err, integrationId: nango.integration.id });
        return undefined;
    }
}

export async function releaseZoomWebhookDedupeClaim(claim: ZoomWebhookDedupeClaim | null | undefined): Promise<void> {
    if (!claim) {
        return;
    }
    try {
        const store = await getKVStore();
        await store.deleteIfValueEquals(claim.key, claim.token);
    } catch (err) {
        logger.error('zoom webhook dedupe release failed', { error: err, key: claim.key });
    }
}
