import { NangoError } from '@nangohq/shared';
import { Err, getLogger, Ok } from '@nangohq/utils';

import { verifyNangoWebhookSecret } from './nango-webhook-secret.js';

import type { ShipStationWebhook, WebhookHandler } from './types.js';

const logger = getLogger('Webhook.Shipstation');

const route: WebhookHandler<ShipStationWebhook> = async (nango, headers, body, _rawBody, query) => {
    // ShipStation does not sign webhooks. v2 can send custom headers, v1 only takes a URL.
    const verified = verifyNangoWebhookSecret({ secret: nango.integration.custom?.['webhookSecret'], headers, query });
    if (verified.isErr()) {
        return Err(verified.error);
    }

    // https://docs.shipstation.com/openapi/webhooks/create_webhook
    // v2 allows for specifying for a connection ID in the headers
    let connectionIdentifierValue = headers['x-nango-connection-id'];
    let propName = 'connectionId';

    if (!connectionIdentifierValue) {
        const resourceUrl = body?.resource_url;
        if (resourceUrl) {
            try {
                const url = new URL(resourceUrl);
                connectionIdentifierValue = url.searchParams.get('storeID') || url.searchParams.get('store_id') || undefined;
                if (connectionIdentifierValue) {
                    // v2 can have a prefix before the ID (e.g., 'prefix-id')
                    // extract everything after the dash if present
                    if (connectionIdentifierValue.includes('-')) {
                        connectionIdentifierValue = connectionIdentifierValue.split('-').slice(1).join('-');
                    }
                    propName = 'metadata.storeId';
                }
            } catch {
                logger.warning('Failed to parse resource_url from ShipStation webhook', { resource_url: resourceUrl });
            }
        }
    }

    if (!connectionIdentifierValue) {
        return Err(new NangoError('webhook_missing_nango_connection_id'));
    }

    const response = await nango.executeScriptForWebhooks({
        payload: body,
        webhookType: 'resource_type',
        connectionIdentifierValue,
        propName
    });

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;
