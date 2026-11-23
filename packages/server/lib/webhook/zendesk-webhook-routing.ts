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
// The timestamp is ISO 8601, and deliveries more than 5 minutes off are rejected as replays.
// https://developer.zendesk.com/documentation/webhooks/verifying/
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
