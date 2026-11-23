import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { connectionsToRoute, rejectUnverifiedWebhook } from './nango-webhook-secret.js';

import type { WebhookHandler } from './types.js';

/**
 * The body of a PostHog webhook destination is a template the user can edit. The default one sends the
 * captured event, whose name is `event.event`, for example `$pageview`.
 * https://posthog.com/docs/cdp/destinations/webhook
 */
export interface PostHogWebhookPayload {
    event?: { uuid?: string; event?: string; distinct_id?: string; properties?: Record<string, unknown>; timestamp?: string; url?: string };
    person?: Record<string, unknown>;
    [key: string]: unknown;
}

const MISSING_SECRET = { reason: 'posthog_missing_webhook_secret', remediation: 'Set webhookSecret in the connection metadata' };

// PostHog does not sign webhooks and its payload does not identify a connection. Each end user's PostHog
// project adds its own webhook destination, so the URL carries the connection id, and the destination sends
// that connection's Nango webhook secret in an `x-nango-webhook-secret` header.
const route: WebhookHandler<PostHogWebhookPayload> = async (nango, headers, body, _rawBody, query) => {
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
        webhookType: 'event.event',
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
