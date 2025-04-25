import type { WebhookHandler, AirtableWebhookReference } from './types.js';
import type { LogContextGetter } from '@nangohq/logs';

const route: WebhookHandler<AirtableWebhookReference> = async (nango, integration, _headers, body, _rawBody, logContextGetter: LogContextGetter) => {
    // airtable webhooks have a catch-all type so we inject the catch all to be
    // able to route it correctly
    const editedBodyWithCatchAll = { ...body, type: '*' };
    const response = await nango.executeScriptForWebhooks(integration, editedBodyWithCatchAll, 'type', 'webhook.id', logContextGetter, 'metadata.webhooks');
    return {
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    };
};

export default route;
