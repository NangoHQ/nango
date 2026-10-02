import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { connectionsWithValidSecret, rejectUnverifiedWebhook } from './nango-webhook-secret.js';

import type { affinityWebhookResponse, WebhookHandler } from './types.js';

// Affinity does not sign webhooks and its payload does not identify a connection. Each end user's
// Affinity instance registers its own webhook URL, so the URL carries the connection id and that
// connection's Nango webhook secret.
const route: WebhookHandler<affinityWebhookResponse> = async (nango, headers, body, _rawBody, query) => {
    const connectionId = query?.['nangoConnectionId'];
    if (!connectionId) {
        return Err(new NangoError('webhook_missing_connection_id'));
    }

    const connection = await nango.getConnectionForWebhook(connectionId);
    if (connectionsWithValidSecret(connection ? [connection] : [], headers, query).length === 0) {
        return rejectUnverifiedWebhook(headers, query);
    }

    const response = await nango.executeScriptForWebhooks({
        payload: body,
        webhookType: 'type',
        connectionIdentifierValue: connectionId,
        propName: 'connectionId'
    });

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;
