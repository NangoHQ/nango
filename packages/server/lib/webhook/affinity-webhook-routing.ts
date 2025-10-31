import { Ok } from '@nangohq/utils';

import type { WebhookHandler, affinityWebhookResponse } from './types.js';

const route: WebhookHandler<affinityWebhookResponse> = async (nango, _headers, body, _rawBody) => {
    const response = await nango.executeScriptForWebhooks({
        body,
        webhookType: body.type
    });

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;
