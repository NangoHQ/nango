import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { isFreshTimestamp, validateHmacSignature } from './signature.js';

import type { WebhookHandler } from './types.js';

/**
 * Webhooks subscribed to Zendesk events carry `type`, for example `zen:event-type:ticket.created`. Webhooks fired
 * by a trigger or automation send a body the user writes, which has no `type` unless they add one.
 * https://developer.zendesk.com/api-reference/webhooks/event-types/webhook-event-types/
 */
export interface ZendeskWebhookPayload {
    type?: string;
    account_id?: number;
    id?: string;
    time?: string;
    subject?: string;
    detail?: Record<string, unknown>;
    event?: Record<string, unknown>;
    [key: string]: unknown;
}

const TIMESTAMP_HEADER = 'x-zendesk-webhook-signature-timestamp';
const SIGNATURE_HEADER = 'x-zendesk-webhook-signature';

// Zendesk signs `{timestamp}{rawBody}` with HMAC-SHA256 keyed by the webhook's signing secret, base64 encoded.
// https://developer.zendesk.com/documentation/webhooks/verifying/
// The timestamp is ISO 8601 in UTC, for example `2021-03-25T05:09:27Z`, as in Zendesk's example request and real
// deliveries; the verifying docs don't specify it.
// https://developer.zendesk.com/documentation/webhooks/anatomy-of-a-webhook-request/
// Zendesk gives no replay window, so the 5 minutes is our choice, the window Standard Webhooks and Stripe use.
// Zendesk retries only briefly: up to 3 times after a 409, up to 5 times after a 12-second timeout, and after a 429
// or 503 only when `retry-after` is under 60 seconds.
// https://developer.zendesk.com/documentation/webhooks/creating-and-monitoring-webhooks/#webhook-retry-logic
// Its docs don't say so, but each retry is signed again: a real retry, a second after a 409, kept the body and
// came with a new timestamp, so the window doesn't drop retries.
// Each webhook has its own signing secret, so each one is registered with `?nangoConnectionId=` and verified
// against the secret stored on that connection.
const route: WebhookHandler<ZendeskWebhookPayload> = async (nango, headers, body, rawBody, query) => {
    const nangoConnectionId = query?.['nangoConnectionId'];
    if (!nangoConnectionId) {
        return Err(new NangoError('webhook_missing_connection_id'));
    }

    const timestamp = headers[TIMESTAMP_HEADER];
    const signature = headers[SIGNATURE_HEADER];
    if (!timestamp || !signature) {
        return Err(new NangoError('webhook_missing_signature'));
    }

    // An unknown connection, one without a secret, a stale timestamp and a wrong signature all return the same
    // error, so the endpoint can't be used to check which connection ids exist.
    const connection = await nango.getConnectionForWebhook(nangoConnectionId);
    // TODO: NAN-6927 move off metadata
    const secret = connection?.metadata?.['webhookSecret'];
    const signedAt = Date.parse(timestamp);
    if (
        typeof secret !== 'string' ||
        !secret ||
        !isFreshTimestamp(Math.floor(signedAt / 1000)) ||
        !validateHmacSignature({ secret, rawBody, payload: `${timestamp}${rawBody}`, signature, digest: 'base64' })
    ) {
        return Err(new NangoError('webhook_invalid_signature'));
    }

    const response = await nango.executeScriptForWebhooks({
        payload: body,
        webhookType: 'type',
        connectionIdentifierValue: nangoConnectionId,
        propName: 'connectionId'
    });

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;
