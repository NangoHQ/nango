import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { isFreshTimestamp, validateHmacSignature } from './signature.js';

import type { LayloWebhookPayload, WebhookHandler } from './types.js';

const TIMESTAMP_HEADER = 'x-laylo-timestamp';
const SIGNATURE_HEADER = 'x-signature-256';

function verifyOrError(secret: string, headers: Record<string, string>, rawBody: string): NangoError | null {
    const timestamp = headers[TIMESTAMP_HEADER];
    const signature = headers[SIGNATURE_HEADER];

    if (!timestamp || !signature) {
        return new NangoError('webhook_missing_signature');
    }

    const timestampMs = Number(timestamp);
    if (!Number.isSafeInteger(timestampMs) || !isFreshTimestamp(Math.floor(timestampMs / 1000))) {
        return new NangoError('webhook_invalid_signature');
    }

    const valid = validateHmacSignature({ secret, rawBody, payload: `${timestamp}${rawBody}`, signature, digest: 'base64' });
    return valid ? null : new NangoError('webhook_invalid_signature');
}

const route: WebhookHandler<LayloWebhookPayload> = async (nango, headers, body, rawBody, query) => {
    const nangoConnectionId = query?.['nangoConnectionId'];
    if (!nangoConnectionId) {
        return Err(new NangoError('webhook_missing_nango_connection_id'));
    }

    const connection = await nango.getConnectionForWebhook(nangoConnectionId);
    // TODO: NAN-6927 move off metadata
    const connectionSecret = connection?.metadata?.['webhookSecret'];
    if (!connection || !connectionSecret) {
        return Err(new NangoError('webhook_invalid_secret', { reason: 'No webhook secret configured to validate this request' }));
    }
    if (typeof connectionSecret !== 'string') {
        return Err(new NangoError('webhook_invalid_secret', { reason: 'Invalid webhook secret' }));
    }

    const error = verifyOrError(connectionSecret, headers, rawBody);
    if (error) {
        return Err(error);
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
