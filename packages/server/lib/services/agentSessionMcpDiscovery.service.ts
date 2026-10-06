import { getLogger } from '@nangohq/utils';

import { listRemoteTools, mcpEndpointOf, withRemoteMcpSession } from './remoteMcp.service.js';

import type { RemoteMcpTool } from './remoteMcp.service.js';
import type { AgentSessionResolvedConnection, DBEnvironment, DBPlan, DBTeam } from '@nangohq/types';

const logger = getLogger('Server.AgentSession.McpDiscovery');

const DISCOVERY_TIMEOUT_MS = 10_000;
const MAX_TOOLS_PER_SERVER = 200;

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
    const listing = withRemoteMcpSession(
        { account, environment, plan, integrationId: connection.integrationId, connectionId: connection.connectionId, provider: connection.provider },
        async (session) => await listRemoteTools(session, { maxTools: MAX_TOOLS_PER_SERVER, integrationId: connection.integrationId })
    ).then(({ result }): McpServerDiscovery => {
        if (result.isErr()) {
            logger.info('MCP server could not be listed', { integrationId: connection.integrationId, code: result.error.code, error: result.error.message });
            return { status: 'unavailable' };
        }

        return { status: 'available', tools: result.value };
    });

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<McpServerDiscovery>((resolve) => {
        timer = setTimeout(() => {
            logger.info('MCP server listing timed out', { integrationId: connection.integrationId });
            resolve({ status: 'unavailable' });
        }, DISCOVERY_TIMEOUT_MS);
    });

    try {
        return await Promise.race([listing, timeout]);
    } catch (err) {
        logger.error('MCP server listing failed', { integrationId: connection.integrationId, error: err });
        return { status: 'unavailable' };
    } finally {
        clearTimeout(timer);
    }
}
