import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { connectionsToRoute, rejectUnverifiedWebhook } from './nango-webhook-secret.js';

import type { affinityWebhookResponse, WebhookHandler } from './types.js';

const MISSING_SECRET = { reason: 'affinity_missing_webhook_secret', remediation: 'Set webhookSecret in the connection metadata' };

// Affinity does not sign webhooks and its payload does not identify a connection. Each end user's
// Affinity instance registers its own webhook URL, so the URL carries the connection id and that
// connection's Nango webhook secret.
const route: WebhookHandler<affinityWebhookResponse> = async (nango, headers, body, _rawBody, query) => {
    const connectionId = query?.['nangoConnectionId'];
    if (!connectionId) {
        return Err(new NangoError('webhook_missing_connection_id'));
    }

    const connection = await nango.getConnectionForWebhook(connectionId);
    const routed = await connectionsToRoute({ nango, connections: connection ? [connection] : [], headers, query, unverified: MISSING_SECRET });
    if (routed.length === 0) {
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
