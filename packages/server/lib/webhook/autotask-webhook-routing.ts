import { Ok } from '@nangohq/utils';

import type { AutotaskWebhookPayload, WebhookHandler } from './types.js';

/**
 * Webhook routing handler for Autotask.
 *
 * Connection routing: Routes by payload Guid to the connection whose metadata
 * contains the matching `webhookGuid` value.
 *
 * Signature verification: Skipped at the routing level. Autotask uses a per-webhook
 * SecretKey for HMAC-SHA1 signatures. Individual sync `onWebhook` handlers should
 * verify the signature if needed.
 *
 * Webhook type: The `EntityType` field from the payload (e.g., "Ticket", "Company")
 * is used to match against webhook subscriptions defined in sync configs.
 */
const route: WebhookHandler<AutotaskWebhookPayload> = async (nango, _headers, body, _rawBody) => {
    const response = await nango.executeScriptForWebhooks({
        body,
        webhookType: 'EntityType', // Autotask webhook entity type field
        connectionIdentifier: 'Guid',
        propName: 'metadata.webhookGuid'
    });

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;
