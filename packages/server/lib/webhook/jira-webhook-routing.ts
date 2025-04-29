import { Ok } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';
import type { LogContextGetter } from '@nangohq/logs';

const route: WebhookHandler = async (nango, integration, _headers, body, _rawBody, logContextGetter: LogContextGetter) => {
    if (Array.isArray(body)) {
        let connectionIds: string[] = [];
        for (const event of body) {
            const response = await nango.executeScriptForWebhooks(
                integration,
                event,
                'payload.webhookEvent',
                'payload.user.accountId',
                logContextGetter,
                'accountId'
            );
            if (response && response.connectionIds?.length > 0) {
                connectionIds = connectionIds.concat(response.connectionIds);
            }
        }

        return Ok({
            content: { status: 'success' },
            statusCode: 200,
            connectionIds
        });
    } else {
        const response = await nango.executeScriptForWebhooks(
            integration,
            body,
            'payload.webhookEvent',
            'payload.user.accountId',
            logContextGetter,
            'accountId'
        );
        return Ok({
            content: { status: 'success' },
            statusCode: 200,
            connectionIds: response?.connectionIds || [],
            toForward: body
        });
    }
};

export default route;
