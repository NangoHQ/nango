import type { LogContextGetter } from '@nangohq/logs';
import type { WebhookHandler } from './types.js';

const route: WebhookHandler = async (nango, integration, _headers, body, _rawBody, logContextGetter: LogContextGetter) => {
    return await nango.executeScriptForWebhooks(integration, body, 'event', 'created_by', logContextGetter, `owner`);
};
export default route;
