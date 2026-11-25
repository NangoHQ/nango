import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { isFreshTimestamp, validateHmacSignature } from './signature.js';

import type { BambooHrWebhookPayload, WebhookHandler } from './types.js';

const TIMESTAMP_HEADER = 'x-bamboohr-timestamp';
const SIGNATURE_HEADER = 'x-bamboohr-signature';

// BambooHR signs `{rawBody}{timestamp}` with the webhook's private key, hex encoded. The timestamp is in
// Unix seconds and set when the request is sent, so stale ones are rejected as replays.
// https://documentation.bamboohr.com/docs/webhooks
// The payload carries no company identifier, and every webhook has its own private key, so each one is
// registered with `?nangoConnectionId=` and verified against the secret stored on that connection.
const route: WebhookHandler<BambooHrWebhookPayload> = async (nango, headers, body, rawBody, query) => {
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
        !validateHmacSignature({ secret, rawBody, payload: `${rawBody}${timestamp}`, signature })
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
