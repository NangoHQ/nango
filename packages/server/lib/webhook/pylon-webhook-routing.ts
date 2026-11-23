import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { isFreshTimestamp, validateHmacSignature } from './signature.js';

import type { WebhookHandler } from './types.js';

/** Pylon webhook bodies are templates the user writes in a trigger or macro, so they have no fixed shape or event type. */
export type PylonWebhookPayload = Record<string, unknown>;

const TIMESTAMP_HEADER = 'x-pylon-timestamp';
const SIGNATURE_HEADER = 'x-pylon-signature-v2';

// Pylon signs `{timestamp}.{rawBody}` with HMAC-SHA256 keyed by the webhook's secret, hex encoded. The timestamp
// is in Unix seconds and deliveries more than 5 minutes off are rejected as replays. The legacy
// `x-pylon-signature` signs the body alone, so it is not accepted.
// https://docs.usepylon.com/pylon-docs/developer/webhooks
// The body is user-written and carries no account identifier, so each webhook is registered with
// `?nangoConnectionId=` and verified against the secret stored on that connection.
const route: WebhookHandler<PylonWebhookPayload> = async (nango, headers, body, rawBody, query) => {
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
    if (
        typeof secret !== 'string' ||
        !secret ||
        !isFreshTimestamp(timestamp) ||
        !validateHmacSignature({ secret, rawBody, payload: `${timestamp}.${rawBody}`, signature })
    ) {
        return Err(new NangoError('webhook_invalid_signature'));
    }

    const response = await nango.executeScriptForWebhooks({
        payload: body,
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
