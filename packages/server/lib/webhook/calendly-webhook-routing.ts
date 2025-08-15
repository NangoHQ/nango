import { Ok } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';

const route: WebhookHandler = async (nango, _headers, body) => {
    const response = await nango.executeScriptForWebhooks({
        body,
        webhookType: 'event',
        connectionIdentifier: 'created_by',
        propName: 'owner'
    });

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};
export default route;
