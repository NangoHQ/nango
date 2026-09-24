import { connectionService } from '@nangohq/shared';
import { Ok } from '@nangohq/utils';

import { connectionsWithValidSecret, rejectUnverifiedWebhook } from './nango-webhook-secret.js';

import type { WebhookHandler } from './types.js';

// Fillout does not sign webhooks. It lets you add a custom header, which carries the Nango webhook
// secret of the connection that owns the form.
// https://www.fillout.com/help/webhook#available-webhook-options
const route: WebhookHandler = async (nango, headers, body, _rawBody, query) => {
    const events: Record<string, unknown>[] = Array.isArray(body) ? body : [body];
    const connectionIds = new Set<string>();

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

        // Each connection is checked against its own secret, so only the ones it matches are routed.
        for (const connection of connectionsWithValidSecret(connections, headers, query)) {
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
        toForward: body
    });
};

export default route;
