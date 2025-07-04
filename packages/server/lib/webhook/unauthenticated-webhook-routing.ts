import { Ok } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';
import type { LogContextGetter } from '@nangohq/logs';

const route: WebhookHandler = async (nango, integration, _headers, body, _, logContextGetter: LogContextGetter) => {
    /**
     * Only accepted format
     * { type: '__STRING__', connectionId: '__STRING__', ... }
     */
    const response = await nango.executeScriptForWebhooks(integration, body, 'type', 'connectionId', logContextGetter, 'connectionId');
    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;
