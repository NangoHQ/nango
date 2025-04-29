import type { LogContextGetter } from '@nangohq/logs';
import type { WebhookHandler } from './types.js';
import { Ok } from '@nangohq/utils';

const route: WebhookHandler = async (nango, integration, _headers, body, _rawBody, logContextGetter: LogContextGetter) => {
    const response = await nango.executeScriptForWebhooks(integration, body, 'event', 'created_by', logContextGetter, `owner`);
    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};
export default route;
