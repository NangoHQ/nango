import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { verifyZoomWebhookAndHandleHandshake } from './zoom-webhook-shared.js';

import type { WebhookHandler, ZoomWebhookPayload } from './types.js';

const route: WebhookHandler<ZoomWebhookPayload> = async (nango, headers, body, rawBody, query) => {
    const connectionIdentifierValue = query?.['nangoConnectionId'];

    const handled = await verifyZoomWebhookAndHandleHandshake(nango, headers, body, rawBody, connectionIdentifierValue);
    if (handled) {
        return handled;
    }

    if (!connectionIdentifierValue) {
        return Err(new NangoError('webhook_missing_connection_id'));
    }

    const response = await nango.executeScriptForWebhooks({
        payload: body,
        webhookType: 'event',
        connectionIdentifierValue,
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
