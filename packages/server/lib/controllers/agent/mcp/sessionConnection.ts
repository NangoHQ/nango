import db from '@nangohq/database';
import { report } from '@nangohq/utils';

import * as agentSessionService from '../../../services/agentSession.service.js';
import * as agentSessionConnectionsService from '../../../services/agentSessionConnections.service.js';
import * as agentSessionMcpDiscoveryService from '../../../services/agentSessionMcpDiscovery.service.js';
import * as agentSessionToolsetService from '../../../services/agentSessionToolset.service.js';
import { withAddedToolSlugs } from './sessionServer.js';

import type { AgentSession, AgentSessionResolvedConnection, DBEnvironment, DBPlan, DBTeam } from '@nangohq/types';

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

    await fill({ session, integrationId, connection });

    return connection;
}

export async function withConnectionsCreatedInSession(session: AgentSession): Promise<AgentSession> {
    if (!session.metaTools.nangoCreateConnection.enabled) {
        return session;
    }

    const missing = Object.keys(session.compiledToolset).filter((integrationId) => !Object.hasOwn(session.resolvedConnections, integrationId));
    if (missing.length === 0) {
        return session;
    }

    const created = await agentSessionConnectionsService.findConnectionsCreatedForSession({ environmentId: session.environmentId, sessionId: session.id });
    const found = missing.flatMap((integrationId) => (Object.hasOwn(created, integrationId) && created[integrationId] ? [created[integrationId]] : []));
    if (found.length === 0) {
        return session;
    }

    await Promise.all(found.map((connection) => fill({ session, integrationId: connection.integrationId, connection })));

    return {
        ...session,
        resolvedConnections: { ...session.resolvedConnections, ...Object.fromEntries(found.map((connection) => [connection.integrationId, connection])) }
    };
}

export function hasPendingMcpServers(session: AgentSession): boolean {
    return Object.values(session.compiledToolset).some((integration) => agentSessionToolsetService.pendingMcpServerOf(integration));
}

/**
 * MCP servers are listed when the session is created, so a server the agent connected afterwards is
 * listed here instead, the first time the session is used once it is connected.
 */
export async function withMcpToolsDiscovered({
    account,
    environment,
    plan,
    session
}: {
    account: DBTeam;
    environment: DBEnvironment;
    plan: DBPlan | null;
    session: AgentSession;
}): Promise<AgentSession> {
    const pending = Object.keys(session.compiledToolset).filter((integrationId) => {
        const integration = session.compiledToolset[integrationId];
        return integration && agentSessionToolsetService.pendingMcpServerOf(integration);
    });
    const connections = pending.flatMap((integrationId) =>
        Object.hasOwn(session.resolvedConnections, integrationId) && session.resolvedConnections[integrationId]
            ? [session.resolvedConnections[integrationId]]
            : []
    );
    if (connections.length === 0) {
        return session;
    }

    const discovered = await agentSessionMcpDiscoveryService.discoverMcpTools({ account, environment, plan, connections });
    const compiled = Object.fromEntries(
        [...discovered].flatMap(([integrationId, discovery]) => {
            const integration = session.compiledToolset[integrationId];
            return integration ? [[integrationId, agentSessionToolsetService.withDiscoveredMcpTools({ integration, discovery })] as const] : [];
        })
    );

    const stored = await agentSessionService.fillPendingMcpServers(db.knex, {
        id: session.id,
        pending,
        integrations: withAddedToolSlugs({ session, added: compiled })
    });
    if (stored.isErr()) {
        // Tools that were not stored have no settled names, so they wait for the next listing.
        report(stored.error);
        return session;
    }

    return { ...session, compiledToolset: stored.value };
}

async function fill({ session, integrationId, connection }: { session: AgentSession; integrationId: string; connection: AgentSessionResolvedConnection }) {
    // The connection is usable whether or not it gets written down, so a failure here costs another
    // lookup on the next call rather than the call the agent is making now.
    const filled = await agentSessionService.fillResolvedConnection(db.knex, { id: session.id, integrationId, connection });
    if (filled.isErr()) {
        report(filled.error);
    }
}
