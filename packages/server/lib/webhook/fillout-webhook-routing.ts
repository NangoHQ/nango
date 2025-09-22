import { Ok } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';

const route: WebhookHandler = async (nango, _headers, body) => {
    // We are not validating the webhook here since the provider does not offer a built-in validation method.
    // They only mention that you can include a custom header to assist with validation.
    // https://www.fillout.com/help/webhook#available-webhook-options

    if (Array.isArray(body)) {
        const connectionIds = new Set<string>();

        for (const event of body) {
            const response = await nango.executeScriptForWebhooks({
                body: event,
                webhookType: 'type',
                connectionIdentifier: 'formId',
                propName: 'metadata.formId'
            });

            if (response?.connectionIds?.length) {
                for (const id of response.connectionIds) {
                    connectionIds.add(id);
                }
            }
        }

        return Ok({
            content: { status: 'success' },
            statusCode: 200,
            connectionIds: Array.from(connectionIds),
            toForward: body
        });
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
