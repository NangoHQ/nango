import type { WebhookHandler } from './types.js';
import type { LogContextGetter } from '@nangohq/logs';

const route: WebhookHandler = async (nango, integration, _headers, body, _, logContextGetter: LogContextGetter) => {
    /**
     * Only accepted format
     * { type: '__STRING__', connectionId: '__STRING__', ... }
     */
    return await nango.executeScriptForWebhooks(integration, body, 'type', 'connectionId', logContextGetter, 'connectionId');
};

export default route;
