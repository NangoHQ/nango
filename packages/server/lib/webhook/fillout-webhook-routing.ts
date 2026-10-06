import { connectionService } from '@nangohq/shared';
import { Ok } from '@nangohq/utils';

import { connectionsToRoute, rejectUnverifiedWebhook } from './nango-webhook-secret.js';

import type { WebhookHandler } from './types.js';

const MISSING_SECRET = { reason: 'fillout_missing_webhook_secret', remediation: 'Set webhookSecret in the connection metadata' };

// Fillout does not sign webhooks. It lets you add a custom header, which carries the Nango webhook
// secret of the connection that owns the form.
// https://www.fillout.com/help/webhook#available-webhook-options
const route: WebhookHandler = async (nango, headers, body, _rawBody, query) => {
    const events: Record<string, unknown>[] = Array.isArray(body) ? body : [body];
    const connectionIds = new Set<string>();
    const routedEvents: Record<string, unknown>[] = [];

    for (const event of events) {
        const formId = event?.['formId'];
        if (typeof formId !== 'string' || !formId) {
            continue;
        }

        const connections =
            (await connectionService.findConnectionsByMetadataValue({
                metadataProperty: 'formId',
                payloadIdentifier: formId,
                configId: nango.integration.id,
                environmentId: nango.environment.id
            })) || [];

        const routed = await connectionsToRoute({ nango, connections, headers, query, unverified: MISSING_SECRET });
        if (routed.length > 0) {
            routedEvents.push(event);
        }

        for (const connection of routed) {
            const response = await nango.executeScriptForWebhooks({
                payload: event,
                webhookType: 'type',
                connectionIdentifierValue: connection.connection_id,
                propName: 'connectionId'
            });
            for (const id of response.connectionIds) {
                connectionIds.add(id);
            }
        }
    }

    if (connectionIds.size === 0) {
        return rejectUnverifiedWebhook(headers, query);
    }

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: Array.from(connectionIds),
        // Events no connection accepted must not reach the ones that did.
        toForward: Array.isArray(body) ? routedEvents : body
    });
};

export default route;
