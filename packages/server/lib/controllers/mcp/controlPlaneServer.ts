import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { hasScope } from '../../middleware/scope.middleware.js';
import { logsListOperationsTool } from './logs/listOperations.js';

import type { ControlPlaneMcpTool } from './controlPlaneTool.js';
import type { ApiKeyScope, DBEnvironment, DBTeam } from '@nangohq/types';

const controlPlaneMcpTools: ControlPlaneMcpTool[] = [logsListOperationsTool];

export function createControlPlaneMcpServer(account: DBTeam, environment: DBEnvironment, grantedScopes: string[] | undefined): McpServer {
    const server = new McpServer(
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

    const context = { account, environment, grantedScopes };
    for (const toolDefinition of controlPlaneMcpTools) {
        const registeredTool = server.registerTool(
            toolDefinition.name,
            {
                description: toolDefinition.description,
                inputSchema: toolDefinition.inputSchema
            },
            async (args: unknown) => {
                assertRequiredScopes({ grantedScopes, requiredScopes: toolDefinition.requiredScopes });
                return await toolDefinition.handler(args, context);
            }
        );

        if (!hasRequiredScopes({ grantedScopes, requiredScopes: toolDefinition.requiredScopes })) {
            // Disabled tools are omitted from tools/list and rejected by the SDK if called.
            registeredTool.disable();
        }
    }

    return server;
}

function assertRequiredScopes({ grantedScopes, requiredScopes }: { grantedScopes: string[] | undefined; requiredScopes: ApiKeyScope[] }): void {
    const missingScopes = requiredScopes.filter((scope) => !hasScope({ grantedScopes, requiredScope: scope }));
    if (missingScopes.length > 0) {
        throw new Error(`Insufficient scope. Required: ${missingScopes.join(', ')}`);
    }
}

function hasRequiredScopes({ grantedScopes, requiredScopes }: { grantedScopes: string[] | undefined; requiredScopes: ApiKeyScope[] }): boolean {
    return requiredScopes.every((scope) => hasScope({ grantedScopes, requiredScope: scope }));
}
