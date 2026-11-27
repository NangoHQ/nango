import crypto from 'node:crypto';

import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { isFreshTimestamp } from './signature.js';

import type { WebhookHandler } from './types.js';

/** SendGrid posts a batch of events, each with its own `event` type. https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/event */
export type SendGridWebhookPayload = {
    email: string;
    timestamp: number;
    event: 'processed' | 'dropped' | 'delivered' | 'deferred' | 'bounce' | 'open' | 'click' | 'spamreport' | 'unsubscribe' | (string & {});
    sg_event_id: string;
    sg_message_id?: string;
    [key: string]: unknown;
}[];

const SIGNATURE_HEADER = 'x-twilio-email-event-webhook-signature';
const TIMESTAMP_HEADER = 'x-twilio-email-event-webhook-timestamp';
// SendGrid retries failed deliveries for up to 24 hours and doesn't say whether a retry is signed again, so a
// signature is accepted for that long (plus some clock skew) and no longer.
const TOLERANCE_SECONDS = 24 * 60 * 60 + 5 * 60;

// SendGrid signs `{timestamp}{rawBody}` with ECDSA P-256 over SHA-256 and sends the base64 DER signature. The
// end user stores the webhook's verification key, a base64 DER public key, as the connection's `webhookSecret`.
// https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/getting-started-event-webhook-security-features
// A delivery replayed within that window runs again, so dedupe on each event's `sg_event_id`.
// The payload carries no account identifier, so each webhook is registered with `?nangoConnectionId=`.
const route: WebhookHandler<SendGridWebhookPayload> = async (nango, headers, body, rawBody, query) => {
    const nangoConnectionId = query?.['nangoConnectionId'];
    if (!nangoConnectionId) {
        return Err(new NangoError('webhook_missing_connection_id'));
    }

    const signature = headers[SIGNATURE_HEADER];
    const timestamp = headers[TIMESTAMP_HEADER];
    if (!signature || !timestamp) {
        return Err(new NangoError('webhook_missing_signature'));
    }
    if (!Array.isArray(body) || body.length === 0) {
        return Err(new NangoError('webhook_invalid_body'));
    }

    // An unknown connection, one without a key and a wrong signature all return the same error, so the
    // endpoint can't be used to check which connection ids exist.
    const connection = await nango.getConnectionForWebhook(nangoConnectionId);
    // TODO: NAN-6927 move off metadata
    const verificationKey = connection?.metadata?.['webhookSecret'];
    if (
        typeof verificationKey !== 'string' ||
        !verificationKey ||
        !isFreshTimestamp(timestamp, TOLERANCE_SECONDS) ||
        !verifySignature({ verificationKey, payload: `${timestamp}${rawBody}`, signature })
    ) {
        return Err(new NangoError('webhook_invalid_signature'));
    }

    // Each event in the batch runs the webhook functions subscribed to its own type.
    const connectionIds = new Set<string>();
    for (const event of body) {
        const response = await nango.executeScriptForWebhooks({
            payload: event,
            webhookType: 'event',
            connectionIdentifierValue: nangoConnectionId,
            propName: 'connectionId'
        });
        for (const id of response?.connectionIds || []) {
            connectionIds.add(id);
        }
    }

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: Array.from(connectionIds),
        toForward: body
    });
};

function verifySignature({ verificationKey, payload, signature }: { verificationKey: string; payload: string; signature: string }): boolean {
    try {
        const key = crypto.createPublicKey({ key: Buffer.from(verificationKey, 'base64'), format: 'der', type: 'spki' });
        return crypto.verify('sha256', Buffer.from(payload, 'utf8'), key, Buffer.from(signature, 'base64'));
    } catch {
        return false;
    }
}

export default route;
