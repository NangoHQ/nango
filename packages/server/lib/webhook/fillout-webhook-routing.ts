import { Err, Ok } from '@nangohq/utils';

import { verifyNangoWebhookSecret } from './nango-webhook-secret.js';

import type { WebhookHandler } from './types.js';

const route: WebhookHandler = async (nango, headers, body, _rawBody, query) => {
    // Fillout does not sign webhooks, it only lets you add a custom header, which carries the Nango webhook secret.
    // https://www.fillout.com/help/webhook#available-webhook-options
    const verified = verifyNangoWebhookSecret({ secret: nango.integration.custom?.['webhookSecret'], headers, query });
    if (verified.isErr()) {
        return Err(verified.error);
    }

    if (Array.isArray(body)) {
        const connectionIds = new Set<string>();

        for (const event of body) {
            const response = await nango.executeScriptForWebhooks({
                payload: event,
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
            payload: body,
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
