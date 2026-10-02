import { Ok } from '@nangohq/utils';

import { claimZoomWebhookDedupe, releaseZoomWebhookDedupeClaim, verifyZoomWebhookAndHandleHandshake } from './zoom-webhook-shared.js';

import type { WebhookHandler, ZoomWebhookPayload } from './types.js';

const route: WebhookHandler<ZoomWebhookPayload> = async (nango, headers, body, rawBody) => {
    const handled = verifyZoomWebhookAndHandleHandshake(nango, headers, body, rawBody);
    if (handled) {
        return handled;
    }

    const dedupeClaim = await claimZoomWebhookDedupe(nango, headers['x-zm-request-id']);
    if (dedupeClaim === null) {
        return Ok({ content: null, statusCode: 204 });
    }

    let response;
    try {
        response = await nango.executeScriptForWebhooks({
            payload: body,
            webhookType: 'event',
            connectionIdentifier: 'payload.account_id',
            propName: 'accountId'
        });
    } catch (err) {
        await releaseZoomWebhookDedupeClaim(dedupeClaim);
        throw err;
    }

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;
