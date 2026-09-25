import { connectionService, NangoError } from '@nangohq/shared';
import { Err, getLogger, Ok } from '@nangohq/utils';

import { connectionsWithValidSecret, rejectUnverifiedWebhook } from './nango-webhook-secret.js';

import type { ShipStationWebhook, WebhookHandler } from './types.js';
import type { Metadata } from '@nangohq/types';

const logger = getLogger('Webhook.Shipstation');

// ShipStation v1 does not sign webhooks and only takes a URL, v2 can send custom headers. Either way
// the request carries the Nango webhook secret of the connection it is routed to.
const route: WebhookHandler<ShipStationWebhook> = async (nango, headers, body, _rawBody, query) => {
    // https://docs.shipstation.com/openapi/webhooks/create_webhook
    // v2 allows for specifying for a connection ID in the headers
    let connectionIdentifierValue = headers['x-nango-connection-id'];
    let byStoreId = false;

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
                    byStoreId = true;
                }
            } catch {
                logger.warning('Failed to parse resource_url from ShipStation webhook', { resource_url: resourceUrl });
            }
        }
    }

    if (!connectionIdentifierValue) {
        return Err(new NangoError('webhook_missing_nango_connection_id'));
    }

    let candidates: { connectionId: string; metadata: Metadata | null }[];
    if (byStoreId) {
        const connections =
            (await connectionService.findConnectionsByMetadataValue({
                metadataProperty: 'storeId',
                payloadIdentifier: connectionIdentifierValue,
                configId: nango.integration.id,
                environmentId: nango.environment.id
            })) || [];
        candidates = connections.map((connection) => ({ connectionId: connection.connection_id, metadata: connection.metadata }));
    } else {
        const connection = await nango.getConnectionForWebhook(connectionIdentifierValue);
        candidates = connection ? [connection] : [];
    }

    // A store id can match several connections, each is checked against its own secret.
    const verified = connectionsWithValidSecret(candidates, headers, query);
    if (verified.length === 0) {
        return rejectUnverifiedWebhook(headers, query);
    }

    const connectionIds: string[] = [];
    for (const { connectionId } of verified) {
        const response = await nango.executeScriptForWebhooks({
            payload: body,
            webhookType: 'resource_type',
            connectionIdentifierValue: connectionId,
            propName: 'connectionId'
        });
        connectionIds.push(...response.connectionIds);
    }

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds,
        toForward: body
    });
};

export default route;
