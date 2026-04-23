import { Ok } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';

const route: WebhookHandler = async (nango, _headers, body) => {
    /**
     * Only accepted format
     * { type: '__STRING__', connectionId: '__STRING__', ... }
     */
    if (typeof body?.fanoutKey === 'string' && body.fanoutKey) {
        const response = await nango.executeScriptForWebhooks({
            body,
            webhookType: 'type',
            connectionIdentifier: 'fanoutKey',
            propName: 'metadata.fanoutKey'
        });

        return Ok({
            content: { status: 'success' },
            statusCode: 200,
            connectionIds: response?.connectionIds || [],
            toForward: body
        });
    }

    const response = await nango.executeScriptForWebhooks({
        body,
        webhookType: 'type',
        connectionIdentifier: 'connectionId',
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
