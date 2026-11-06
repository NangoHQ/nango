import { connectionService, NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { connectionsToRoute, rejectUnverifiedWebhook } from './nango-webhook-secret.js';

import type { CommandAlkonWebhookEvent, WebhookHandler } from './types.js';
import type { DBConnectionDecrypted } from '@nangohq/types';

const MISSING_SECRET = { reason: 'command_alkon_missing_webhook_secret', remediation: 'Set webhookSecret in the connection metadata' };

function hasEntityRef(event: CommandAlkonWebhookEvent | null | undefined): event is CommandAlkonWebhookEvent & { entityRef: string } {
    return typeof event?.entityRef === 'string' && event.entityRef.length > 0;
}

// Command Alkon does not sign webhooks. A hook can carry custom headers, which carry the Nango webhook
// secret of the connection that registered it. A delivery is an array of envelopes, each naming the
// entity it belongs to in `entityRef`, matched against the connection's `entityRef`.

const route: WebhookHandler<CommandAlkonWebhookEvent | CommandAlkonWebhookEvent[]> = async (nango, headers, body, _rawBody, query) => {
    const events = Array.isArray(body) ? body : [body];
    if (events.length === 0 || !events.every(hasEntityRef)) {
        return Err(new NangoError('webhook_invalid_body'));
    }

    const connectionIds = new Set<string>();
    const routedEvents: CommandAlkonWebhookEvent[] = [];
    // A delivery usually carries several events for the same entity, so each entity is looked up and verified once.
    const routedByEntity = new Map<string, DBConnectionDecrypted[]>();

    for (const event of events) {
        const { entityRef } = event;

        let routed = routedByEntity.get(entityRef);
        if (!routed) {
            const connections =
                (await connectionService.findConnectionsByConnectionConfigValue('entityRef', entityRef, nango.environment.id, nango.integration.id)) || [];
            routed = await connectionsToRoute({ nango, connections, headers, query, unverified: MISSING_SECRET });
            routedByEntity.set(entityRef, routed);
        }

        if (routed.length === 0) {
            continue;
        }
        routedEvents.push(event);

        for (const connection of routed) {
            const response = await nango.executeScriptForWebhooks({
                payload: event,
                webhookType: 'itemTypeId',
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
        toForward: Array.isArray(body) ? routedEvents : body
    });
};

export default route;
