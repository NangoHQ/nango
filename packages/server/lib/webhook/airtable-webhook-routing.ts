import { Ok } from '@nangohq/utils';

import type { AirtableWebhookReference, WebhookHandler } from './types.js';

const route: WebhookHandler<AirtableWebhookReference> = async (nango, _headers, body) => {
    // airtable webhooks have a catch-all type so we inject the catch all to be
    // able to route it correctly
    const editedBodyWithCatchAll = { ...body, type: '*' };
    const response = await nango.executeScriptForWebhooks({
        body: editedBodyWithCatchAll,
        webhookType: 'type',
        connectionIdentifier: 'webhook.id',
        propName: 'metadata.webhooks'
    });
    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;
