import { Ok } from '@nangohq/utils';

import type { AutotaskWebhookPayload, WebhookHandler } from './types.js';

/**
 * Webhook routing handler for Autotask.
 *
 * Connection routing: Broadcasts to ALL connections. Autotask doesn't support custom
 * headers on outgoing webhooks, so we can't use `x-nango-connection-id`. Instead,
 * each sync's `onWebhook` handler is responsible for filtering by matching the `Guid`
 * in the payload against the connection's metadata.
 *
 * Signature verification: Skipped at the routing level. Autotask uses a per-webhook
 * SecretKey for HMAC-SHA1 signatures, but since we're broadcasting to all connections
 * we don't know which connection's secret to use. Individual sync `onWebhook` handlers
 * should verify the signature if needed.
 *
 * Webhook type: The `EntityType` field from the payload (e.g., "Ticket", "Company")
 * is used to match against webhook subscriptions defined in sync configs.
 */
const route: WebhookHandler<AutotaskWebhookPayload> = async (nango, _headers, body, _rawBody) => {
    const response = await nango.executeScriptForWebhooks({
        body,
        webhookType: 'EntityType' // Autotask webhook entity type field
    });

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;
