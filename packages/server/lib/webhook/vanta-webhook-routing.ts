import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { validateSvixSignature } from './signature.js';

import type { VantaWebhookPayload, WebhookHandler } from './types.js';

// Vanta signs with Standard Webhooks; Svix-hosted senders name the headers `svix-*`.
const hasHeader = (headers: Record<string, string>, name: 'id' | 'timestamp' | 'signature') => Boolean(headers[`webhook-${name}`] || headers[`svix-${name}`]);

/**
 * Each end user creates a webhook in Vanta, with a signing secret of its own, so the webhook URL carries
 * `?nangoConnectionId=` and the delivery is verified against the `webhookSecret` stored on that connection.
 * Vanta posts each event to `<webhook URL>/<event type>`, so the event's type is the URL's last path segment.
 */
const route: WebhookHandler<VantaWebhookPayload> = async (nango, headers, body, rawBody, query, eventType) => {
    const nangoConnectionId = query?.['nangoConnectionId'];
    if (!nangoConnectionId) {
        return Err(new NangoError('webhook_missing_connection_id'));
    }

    // The URL is the only place Vanta names the event, so a delivery without it can't be routed.
    if (!eventType) {
        return Err(new NangoError('webhook_missing_event_type'));
    }

    // Checked before the connection is looked up, so the answer never depends on the connection.
    if (!hasHeader(headers, 'id') || !hasHeader(headers, 'timestamp') || !hasHeader(headers, 'signature')) {
        return Err(new NangoError('webhook_missing_signature'));
    }

    // An unknown connection, one without a secret and a wrong signature all return the same error, so the
    // endpoint can't be used to check which connection ids exist.
    const connection = await nango.getConnectionForWebhook(nangoConnectionId);
    // TODO: NAN-6927 move off metadata
    const secret = connection?.metadata?.['webhookSecret'];
    if (typeof secret !== 'string' || !secret) {
        return Err(new NangoError('webhook_invalid_signature'));
    }

    if (validateSvixSignature({ secret, headers, rawBody }) !== 'valid') {
        return Err(new NangoError('webhook_invalid_signature'));
    }

    const response = await nango.executeScriptForWebhooks({
        payload: body,
        webhookTypeValue: eventType,
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
