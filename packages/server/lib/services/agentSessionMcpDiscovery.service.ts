import tracer from 'dd-trace';

import db from '@nangohq/database';
import { report } from '@nangohq/utils';

import * as agentSessionService from './agentSession.service.js';
import { withAddedToolSlugs } from './agentSessionToolCatalog.service/index.js';
import * as agentSessionToolsetService from './agentSessionToolset.service.js';
import { listRemoteTools, mcpEndpointOf, withRemoteMcpSession } from './remoteMcp.service.js';

import type { RemoteMcpTool } from './remoteMcp.service.js';
import type { AgentSession, AgentSessionResolvedConnection, DBEnvironment, DBPlan, DBTeam } from '@nangohq/types';
import type { Span } from 'dd-trace';

const TOOL_LIST_TIMEOUT_MS = 10_000;

export type McpServerDiscovery = { status: 'available'; tools: RemoteMcpTool[] } | { status: 'unavailable' };

/**
 * Lists the tools of every MCP server among the given connections, all at once. A server that
 * fails or takes too long comes back unavailable, so one slow server cannot hold up or fail the
 * session being created.
 */
export async function discoverMcpTools({
    account,
    environment,
    plan,
    connections
}: {
    account: DBTeam;
    environment: DBEnvironment;
    plan: DBPlan | null;
    connections: AgentSessionResolvedConnection[];
}): Promise<Map<string, McpServerDiscovery>> {
    const servers = connections.filter((connection) => mcpEndpointOf(connection.provider) !== undefined);

    const discovered = await Promise.all(
        servers.map(async (connection) => [connection.integrationId, await discoverServer({ account, environment, plan, connection })] as const)
    );

    return new Map(discovered);
}

async function discoverServer({
    account,
    environment,
    plan,
    connection
}: {
    account: DBTeam;
    environment: DBEnvironment;
    plan: DBPlan | null;
    connection: AgentSessionResolvedConnection;
}): Promise<McpServerDiscovery> {
    return await tracer.trace<Promise<McpServerDiscovery>>('server.agentSession.mcpDiscovery', async (span: Span) => {
        span.setTag('nango.integrationId', connection.integrationId);

        try {
            const { result } = await withRemoteMcpSession(
                { account, environment, plan, integrationId: connection.integrationId, connectionId: connection.connectionId, provider: connection.provider },
                async (session) => await listRemoteTools(session, { timeoutMs: TOOL_LIST_TIMEOUT_MS })
            );
            if (result.isErr()) {
                span.setTag('nango.error', result.error);
                return { status: 'unavailable' };
            }

            return { status: 'available', tools: result.value };
        } catch (err) {
            span.setTag('nango.error', err);
            return { status: 'unavailable' };
        }
    });
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

    const discovered = await discoverMcpTools({ account, environment, plan, connections });
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
