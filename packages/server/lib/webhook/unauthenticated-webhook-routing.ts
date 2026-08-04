import { Ok } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';

const route: WebhookHandler = async (nango, _headers, body) => {
    /**
     * Fan-out routing: dispatches to all connections whose metadata contains
     * { stress_test: <value> } matching the `stress_test` field in the webhook body.
     * To target specific connections, set metadata.stress_test on those connections
     * and include the same value in the webhook payload.
     *
     * Example payload: { type: '...', stress_test: 'true', ... }
     */
    const response = await nango.executeScriptForWebhooks({
        body,
        webhookType: 'type',
        connectionIdentifier: 'stress_test',
        propName: 'metadata.stress_test'
    });
    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;
