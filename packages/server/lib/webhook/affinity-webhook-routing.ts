import { Err, Ok } from '@nangohq/utils';

import { verifyNangoWebhookSecret } from './nango-webhook-secret.js';

import type { affinityWebhookResponse, WebhookHandler } from './types.js';

// Affinity does not sign webhooks and a subscription is only a URL, so the Nango webhook secret
// usually arrives as a query param.
const route: WebhookHandler<affinityWebhookResponse> = async (nango, headers, body, _rawBody, query) => {
    const verified = verifyNangoWebhookSecret({ secret: nango.integration.custom?.['webhookSecret'], headers, query });
    if (verified.isErr()) {
        return Err(verified.error);
    }

    const response = await nango.executeScriptForWebhooks({
        payload: body,
        webhookType: 'type'
    });

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;
