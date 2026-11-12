import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { validateHmacSignature } from './signature.js';

import type { WebhookHandler } from './types.js';

// WooCommerce pings a new webhook with this unsigned form body and only keeps the webhook active on a 2xx.
const PING_BODY = /^webhook_id=\d+$/;

/**
 * WooCommerce signs deliveries with a base64 HMAC-SHA256 of the raw body, keyed with the secret set on
 * the webhook in the store, and sends it as `X-WC-Webhook-Signature`. That secret is set per store, so
 * it lives on the connection as `metadata.webhookSecret` and the connection comes from `nangoConnectionId`.
 * https://woocommerce.github.io/woocommerce-rest-api-docs/#webhooks
 */
const route: WebhookHandler<Record<string, unknown>> = async (nango, headers, body, rawBody, query) => {
    const signature = headers['x-wc-webhook-signature'];

    if (!signature && PING_BODY.test(rawBody)) {
        return Ok({ content: null, statusCode: 204 });
    }

    const connectionIdentifierValue = query?.['nangoConnectionId'];
    if (!connectionIdentifierValue) {
        return Err(new NangoError('webhook_missing_connection_id'));
    }

    if (!signature) {
        return Err(new NangoError('webhook_missing_signature'));
    }

    const connection = await nango.getConnectionForWebhook(connectionIdentifierValue);
    const secret = connection?.metadata?.['webhookSecret'];
    if (typeof secret !== 'string' || !secret) {
        return Err(new NangoError('webhook_invalid_secret', { reason: 'No webhook secret configured to validate this request' }));
    }

    if (!validateHmacSignature({ secret, rawBody, signature, digest: 'base64' })) {
        return Err(new NangoError('webhook_invalid_signature'));
    }

    const response = await nango.executeScriptForWebhooks({
        payload: body,
        webhookTypeValue: headers['x-wc-webhook-topic'] ?? '',
        connectionIdentifierValue,
        propName: 'connectionId'
    });

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response.connectionIds,
        toForward: body
    });
};

export default route;
