import { Ok } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';

const route: WebhookHandler = async (nango, _headers, body) => {
    if (Array.isArray(body)) {
        let connectionIds: string[] = [];
        for (const event of body) {
            const response = await nango.executeScriptForWebhooks({
                body: event,
                webhookType: 'payload.webhookEvent',
                connectionIdentifier: 'payload.user.accountId',
                propName: 'accountId'
            });
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
        const response = await nango.executeScriptForWebhooks({
            body,
            webhookType: 'payload.webhookEvent',
            connectionIdentifier: 'payload.user.accountId',
            propName: 'accountId'
        });
        return Ok({
            content: { status: 'success' },
            statusCode: 200,
            connectionIds: response?.connectionIds || [],
            toForward: body
        });
    }
};

export default route;
