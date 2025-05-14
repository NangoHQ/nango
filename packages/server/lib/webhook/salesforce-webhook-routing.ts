import type { WebhookHandler } from './types.js';
import type { LogContextGetter } from '@nangohq/logs';
import { Ok } from '@nangohq/utils';

const route: WebhookHandler = async (nango, integration, _headers, body, _rawBody, logContextGetter: LogContextGetter) => {
    const response = await nango.executeScriptForWebhooks(integration, body, 'nango.eventType', 'nango.connectionId', logContextGetter, 'connectionId');
    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;
