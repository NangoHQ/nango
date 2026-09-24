import db from '@nangohq/database';
import { report } from '@nangohq/utils';

import * as agentSessionService from '../../../services/agentSession.service.js';
import * as agentSessionConnectionsService from '../../../services/agentSessionConnections.service.js';

import type { AgentSession, AgentSessionResolvedConnection } from '@nangohq/types';

/**
 * The connection an integration's tools run on. Resolved at creation for everything the tenant was
 * already connected to, and looked up here for an integration the agent has since connected itself,
 * because the session row was written before that connection existed.
 */
export async function resolveSessionConnection({
    session,
    integrationId
}: {
    session: AgentSession;
    integrationId: string;
}): Promise<AgentSessionResolvedConnection | null> {
    if (Object.hasOwn(session.resolvedConnections, integrationId)) {
        return session.resolvedConnections[integrationId] ?? null;
    }

    // Nothing can have filled the slot if the agent was never allowed to connect anything.
    if (!session.metaTools.nangoCreateConnection.enabled) {
        return null;
    }

    const connection = await agentSessionConnectionsService.findConnectionCreatedForSession({
        environmentId: session.environmentId,
        sessionId: session.id,
        integrationId
    });
    if (!connection) {
        return null;
    }

    // The connection is usable whether or not it gets written down, so a failure here costs another
    // lookup on the next call rather than the call the agent is making now.
    const filled = await agentSessionService.fillResolvedConnection(db.knex, { id: session.id, integrationId, connection });
    if (filled.isErr()) {
        report(filled.error);
    }

    return connection;
}
