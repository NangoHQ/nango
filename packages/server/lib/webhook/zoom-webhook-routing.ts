import { Ok } from '@nangohq/utils';

import { verifyZoomWebhookAndHandleHandshake } from './zoom-webhook-shared.js';

import type { WebhookHandler, ZoomWebhookPayload } from './types.js';

const route: WebhookHandler<ZoomWebhookPayload> = async (nango, headers, body, rawBody) => {
    const handled = verifyZoomWebhookAndHandleHandshake(nango, headers, body, rawBody);
    if (handled) {
        return handled;
    }

    const response = await nango.executeScriptForWebhooks({
        payload: body,
        webhookType: 'event',
        connectionIdentifier: 'payload.account_id',
        propName: 'metadata.accountId'
    });

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;
