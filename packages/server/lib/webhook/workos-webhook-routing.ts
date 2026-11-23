import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { isFreshTimestamp, validateHmacSignature } from './signature.js';

import type { WebhookHandler } from './types.js';

/** https://workos.com/docs/events */
export interface WorkOSWebhookPayload {
    id: string;
    event: string;
    data: Record<string, unknown>;
    created_at: string;
}

const SIGNATURE_HEADER = 'workos-signature';
// WorkOS' own SDK accepts deliveries signed up to 3 minutes ago.
const TOLERANCE_SECONDS = 3 * 60;

// WorkOS sends `t=<unix milliseconds>, v1=<hex>` in `workos-signature`, where the hex is HMAC-SHA256 of
// `{timestamp}.{rawBody}` keyed by the endpoint's secret.
// https://workos.com/docs/events/data-syncing/webhooks
// The payload carries no environment identifier, so each endpoint is registered with `?nangoConnectionId=` and
// verified against the secret stored on that connection.
const route: WebhookHandler<WorkOSWebhookPayload> = async (nango, headers, body, rawBody, query) => {
    const nangoConnectionId = query?.['nangoConnectionId'];
    if (!nangoConnectionId) {
        return Err(new NangoError('webhook_missing_connection_id'));
    }

    const { timestamp, signature } = parseSignatureHeader(headers[SIGNATURE_HEADER]);
    if (!timestamp || !signature) {
        return Err(new NangoError('webhook_missing_signature'));
    }

    // An unknown connection, one without a secret, a stale timestamp and a wrong signature all return the same
    // error, so the endpoint can't be used to check which connection ids exist.
    const connection = await nango.getConnectionForWebhook(nangoConnectionId);
    // TODO: NAN-6927 move off metadata
    const secret = connection?.metadata?.['webhookSecret'];
    const milliseconds = Number(timestamp);
    if (
        typeof secret !== 'string' ||
        !secret ||
        !Number.isSafeInteger(milliseconds) ||
        !isFreshTimestamp(Math.floor(milliseconds / 1000), TOLERANCE_SECONDS) ||
        !validateHmacSignature({ secret, rawBody, payload: `${timestamp}.${rawBody}`, signature })
    ) {
        return Err(new NangoError('webhook_invalid_signature'));
    }

    const response = await nango.executeScriptForWebhooks({
        payload: body,
        webhookType: 'event',
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

function parseSignatureHeader(header: string | undefined): { timestamp: string | undefined; signature: string | undefined } {
    let timestamp: string | undefined;
    let signature: string | undefined;
    for (const part of (header ?? '').split(',')) {
        const [key, value] = part.trim().split('=', 2);
        if (key === 't') {
            timestamp = value;
        } else if (key === 'v1') {
            signature = value;
        }
    }
    return { timestamp, signature };
}

export default route;
