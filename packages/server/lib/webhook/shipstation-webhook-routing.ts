import { NangoError } from '@nangohq/shared';
import { Err, Ok, getLogger } from '@nangohq/utils';

import type { ShipStationWebhook, WebhookHandler } from './types.js';

const logger = getLogger('Webhook.Shipstation');

const route: WebhookHandler<ShipStationWebhook> = async (nango, headers, body) => {
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
        body,
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
