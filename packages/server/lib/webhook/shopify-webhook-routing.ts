import crypto from 'node:crypto';

import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';

function validateShopifySignature(secret: string, headerSignature: string, rawBody: string): boolean {
    const calculatedHmac = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');

    return crypto.timingSafeEqual(Buffer.from(calculatedHmac, 'base64'), Buffer.from(headerSignature, 'base64'));
}

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
    const url = new URL(`https://${shopDomain}`);
    const subdomain = url.hostname.split('.')[0];

    if (!subdomain) {
        return Err(new NangoError('webhook_missing_shop_domain'));
    }

    const webhookSecret = nango.integration.custom?.['webhookSecret'];

    if (webhookSecret) {
        if (!signature) {
            return Err(new NangoError('webhook_missing_signature'));
        }

        if (!validateShopifySignature(webhookSecret, signature, rawBody)) {
            return Err(new NangoError('webhook_invalid_signature'));
        }
    }

    const response = await nango.executeScriptForWebhooks({
        body,
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
