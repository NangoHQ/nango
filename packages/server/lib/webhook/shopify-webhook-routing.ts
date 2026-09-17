import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { validateHmacSignature } from './signature.js';

import type { WebhookHandler } from './types.js';

function getHeader(headers: Record<string, any>, headerName: string): string | undefined {
    const lowerName = headerName.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === lowerName) {
            return value as string;
        }
    }
    return undefined;
}

const route: WebhookHandler = async (nango, headers, body, rawBody) => {
    // extract Shopify webhook headers (case-insensitive)
    // https://shopify.dev/docs/apps/build/webhooks#headers
    // https://shopify.dev/docs/api/webhooks
    const signature = getHeader(headers, 'x-shopify-hmac-sha256');
    const topic = getHeader(headers, 'x-shopify-topic');
    const shopDomain = getHeader(headers, 'x-shopify-shop-domain');

    if (!shopDomain) {
        return Err(new NangoError('webhook_missing_shop_domain'));
    }

    let subdomain: string | undefined;
    try {
        subdomain = new URL(`https://${shopDomain}`).hostname.split('.')[0];
    } catch {
        subdomain = undefined;
    }

    if (!subdomain) {
        return Err(new NangoError('webhook_missing_shop_domain'));
    }

    // For OAuth apps, we use the client_secret to verify the signature, but for api_key/custom apps, we use the webhookSecret defined when setting up the integration,
    // this can be obtained in the ui after subscribing to a webhook
    const webhookSecret = nango.integration.oauth_client_secret || nango.integration.custom?.['webhookSecret'];

    if (webhookSecret) {
        if (!signature) {
            return Err(new NangoError('webhook_missing_signature'));
        }

        if (!validateHmacSignature({ secret: webhookSecret, rawBody, signature, digest: 'base64' })) {
            return Err(new NangoError('webhook_invalid_signature'));
        }
    } else {
        nango.markUnverified({
            reason: 'shopify_missing_webhook_secret',
            remediation: 'Set the client secret or webhook secret on the integration'
        });
    }

    const response = await nango.executeScriptForWebhooks({
        payload: body,
        webhookTypeValue: topic ?? '',
        connectionIdentifierValue: subdomain,
        propName: 'subdomain'
    });

    const connectionIds = response?.connectionIds || [];

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds,
        toForward: body
    });
};

export default route;
