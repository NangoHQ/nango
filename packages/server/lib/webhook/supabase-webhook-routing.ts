import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { connectionsToRoute, rejectUnverifiedWebhook } from './nango-webhook-secret.js';

import type { WebhookHandler } from './types.js';

/** https://supabase.com/docs/guides/database/webhooks#payload */
export interface SupabaseWebhookPayload {
    type: 'INSERT' | 'UPDATE' | 'DELETE';
    table: string;
    schema: string;
    record: Record<string, unknown> | null;
    old_record: Record<string, unknown> | null;
}

const MISSING_SECRET = { reason: 'supabase_missing_webhook_secret', remediation: 'Set webhookSecret in the connection metadata' };

// Supabase database webhooks are not signed and their payload does not identify a project. Each end user's
// project creates its own webhooks, so the URL carries the connection id, and each webhook sends that
// connection's Nango webhook secret in an `x-nango-webhook-secret` header.
const route: WebhookHandler<SupabaseWebhookPayload> = async (nango, headers, body, _rawBody, query) => {
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
