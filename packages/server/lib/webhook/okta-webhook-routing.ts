import { connectionService, NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { connectionsWithValidSecret, rejectUnverifiedWebhook } from './nango-webhook-secret.js';

import type { InternalNango } from './internal-nango.js';
import type { OktaEventHookPayload, WebhookHandler } from './types.js';
import type { DBConnectionDecrypted } from '@nangohq/types';

const VERIFICATION_HEADER = 'x-okta-verification-challenge';

// Connections store their org either as a full hostname or, for orgs on these domains, as a subdomain.
const OKTA_DOMAINS = ['.okta.com', '.oktapreview.com', '.okta-emea.com'];

function orgHostname(source: unknown): string | null {
    if (typeof source !== 'string') {
        return null;
    }
    try {
        return new URL(source).hostname.toLowerCase() || null;
    } catch {
        return null;
    }
}

async function findOrgConnections(nango: InternalNango, hostname: string): Promise<DBConnectionDecrypted[]> {
    const environmentId = nango.environment.id;
    const integrationId = nango.integration.id;

    const byHostname = (await connectionService.findConnectionsByConnectionConfigValue('hostname', hostname, environmentId, integrationId)) || [];

    const oktaDomain = OKTA_DOMAINS.find((domain) => hostname.endsWith(domain));
    const subdomain = oktaDomain ? hostname.slice(0, -oktaDomain.length) : null;
    const bySubdomain =
        subdomain && !subdomain.includes('.')
            ? (await connectionService.findConnectionsByConnectionConfigValue('subdomain', subdomain, environmentId, integrationId)) || []
            : [];

    const connections = new Map<string, DBConnectionDecrypted>();
    for (const connection of [...byHostname, ...bySubdomain]) {
        connections.set(connection.connection_id, connection);
    }
    return Array.from(connections.values());
}

// Okta event hooks are not signed. The hook's auth header carries the Nango webhook secret of the
// connection that registered it, and `source` names the Okta org, which is matched against the
// connection's hostname or subdomain.
// https://developer.okta.com/docs/concepts/event-hooks/
const route: WebhookHandler<OktaEventHookPayload> = async (nango, headers, body, _rawBody, query) => {
    // One-time GET when the hook is verified. Okta expects the challenge back, and sends no event.
    if (nango.request.method === 'GET') {
        const challenge = headers[VERIFICATION_HEADER];
        if (!challenge) {
            return Err(new NangoError('webhook_invalid_body'));
        }
        return Ok({ content: { verification: challenge }, statusCode: 200, noForward: true });
    }

    const hostname = orgHostname(body?.source);
    const events = body?.data?.events;
    if (!hostname || !Array.isArray(events)) {
        return Err(new NangoError('webhook_invalid_body'));
    }

    const connections = await findOrgConnections(nango, hostname);
    // New route with no unsigned setups to keep working: a connection only gets events once its own webhookSecret verifies,
    // and "Allow unverified webhooks" can't bypass that.
    const routed = connectionsWithValidSecret(connections, headers, query);
    if (routed.length === 0) {
        return rejectUnverifiedWebhook(headers, query);
    }

    const connectionIds = new Set<string>(routed.map((connection) => connection.connection_id));

    for (const connection of routed) {
        for (const event of events) {
            await nango.executeScriptForWebhooks({
                payload: event,
                ...(typeof event?.eventType === 'string' ? { webhookTypeValue: event.eventType } : {}),
                connectionIdentifierValue: connection.connection_id,
                propName: 'connectionId'
            });
        }
    }

    return Ok({
        content: null,
        statusCode: 200,
        connectionIds: Array.from(connectionIds),
        toForward: body
    });
};

export default route;
