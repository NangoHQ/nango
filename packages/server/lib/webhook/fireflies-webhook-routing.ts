import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { isFreshTimestamp, validateHmacSignature } from './signature.js';

import type { WebhookHandler } from './types.js';

/**
 * Webhooks V2 carry `event`, V1 (the developer settings webhook) carries `eventType`.
 * https://docs.fireflies.ai/graphql-api/webhooks-v2
 * https://docs.fireflies.ai/graphql-api/webhooks
 */
export interface FirefliesWebhookPayload {
    event?: 'meeting.transcribed' | 'meeting.summarized' | 'meeting.bot_joined' | (string & {});
    timestamp?: number;
    meeting_id?: string;
    client_reference_id?: string;
    reprocessed_at?: number;
    eventType?: 'Transcription completed' | (string & {});
    meetingId?: string;
    clientReferenceId?: string;
}

const SIGNATURE_HEADER = 'x-hub-signature';

// Fireflies signs the raw body with HMAC-SHA256 keyed by the webhook's secret and sends the hex digest in
// `x-hub-signature` as `sha256=<hex>`, the format Fireflies' V1 → V2 migration table lists for both versions. A bare
// hex digest is accepted too.
// https://docs.fireflies.ai/graphql-api/webhooks-v2#migrating-from-webhooks-v1
// Fireflies signs no timestamp header, but a Webhooks V2 body carries `timestamp`, the Unix milliseconds the
// delivery was sent, new on every retry. It is signed with the body, so V2 deliveries more than 5 minutes off are
// rejected as replays. V1 bodies have no timestamp.
// The payload carries no workspace or user identifier, so each webhook is registered with
// `?nangoConnectionId=` and verified against the secret stored on that connection.
const route: WebhookHandler<FirefliesWebhookPayload> = async (nango, headers, body, rawBody, query) => {
    const nangoConnectionId = query?.['nangoConnectionId'];
    if (!nangoConnectionId) {
        return Err(new NangoError('webhook_missing_connection_id'));
    }

    const signature = headers[SIGNATURE_HEADER];
    if (!signature) {
        return Err(new NangoError('webhook_missing_signature'));
    }

    // An unknown connection, one without a secret, a stale V2 delivery and a wrong signature all return the same
    // error, so the endpoint can't be used to check which connection ids exist.
    const connection = await nango.getConnectionForWebhook(nangoConnectionId);
    // TODO: NAN-6927 move off metadata
    const secret = connection?.metadata?.['webhookSecret'];
    if (typeof secret !== 'string' || !secret || !validateHmacSignature({ secret, rawBody, signature, prefix: 'sha256=' }) || !isFreshV2Delivery(body)) {
        return Err(new NangoError('webhook_invalid_signature'));
    }

    const response = await nango.executeScriptForWebhooks({
        payload: body,
        webhookType: body.event !== undefined ? 'event' : 'eventType',
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

function isFreshV2Delivery(body: FirefliesWebhookPayload): boolean {
    if (body.event === undefined) {
        return true;
    }
    return typeof body.timestamp === 'number' && isFreshTimestamp(Math.floor(body.timestamp / 1000));
}

export default route;
