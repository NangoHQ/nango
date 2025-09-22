import { Ok } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';

const route: WebhookHandler = async (nango, _headers, body) => {
    // We are not validating the webhook here since the provider does not offer a built-in validation method.
    // They only mention that you can include a custom header to assist with validation.
    // https://www.fillout.com/help/webhook#available-webhook-options

    if (Array.isArray(body)) {
        let connectionIds: string[] = [];
        for (const event of body) {
            const response = await nango.executeScriptForWebhooks({
                body: event,
                webhookType: 'type',
                connectionIdentifier: 'formId',
                propName: 'metadata.formId'
            });
            if (response && response.connectionIds?.length > 0) {
                connectionIds = connectionIds.concat(response.connectionIds);
            }
        }
        const uniqueConnectionIds = Array.from(new Set(connectionIds));

        return Ok({ content: { status: 'success' }, statusCode: 200, connectionIds: uniqueConnectionIds, toForward: body });
    } else {
        const response = await nango.executeScriptForWebhooks({
            body,
            webhookType: 'type',
            connectionIdentifier: 'formId',
            propName: 'metadata.formId'
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
