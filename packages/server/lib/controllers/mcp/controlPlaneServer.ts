import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { DBEnvironment, DBTeam } from '@nangohq/types';

export function createControlPlaneMcpServer(_account: DBTeam, _environment: DBEnvironment, _grantedScopes: string[] | undefined): McpServer {
    return new McpServer(
        {
            name: 'Nango Control Plane MCP server',
            version: '1.0.0'
        },
        {
            capabilities: {
                tools: {}
            }
        }
    );
}
