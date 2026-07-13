import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { hasScope } from '../../middleware/scope.middleware.js';
import { logsGetOperationTool } from './logs/getOperation.js';
import { logsListOperationsTool } from './logs/listOperations.js';
import { handleMcpToolError, jsonStructuredContent } from './utils.js';

import type { ControlPlaneMcpTool } from './controlPlaneTool.js';
import type { AnySchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { ApiKeyScope, DBEnvironment, DBTeam } from '@nangohq/types';

const controlPlaneMcpTools: ControlPlaneMcpTool[] = [logsListOperationsTool, logsGetOperationTool];

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
        // Need to cast because we have a different Zod version than the MCP SDK
        const config = {
            description: toolDefinition.description,
            inputSchema: toolDefinition.inputSchema as unknown as AnySchema,
            ...(toolDefinition.outputSchema ? { outputSchema: toolDefinition.outputSchema as unknown as AnySchema } : {})
        };
        const registeredTool = server.registerTool(toolDefinition.name, config, async (args: unknown) => {
            try {
                const result = await toolDefinition.handler(args, context);
                if (result.isErr()) {
                    return handleMcpToolError(result.error, toolDefinition.name);
                }

                return jsonStructuredContent(result.value);
            } catch (err) {
                return handleMcpToolError(err, toolDefinition.name);
            }
        });

        if (!hasRequiredScopes({ grantedScopes, requiredScopes: toolDefinition.requiredScopes })) {
            // Disabled tools are omitted from tools/list and rejected by the SDK if called.
            registeredTool.disable();
        }
    }

    return server;
}

function hasRequiredScopes({ grantedScopes, requiredScopes }: { grantedScopes: string[] | undefined; requiredScopes: ApiKeyScope[] }): boolean {
    return requiredScopes.every((scope) => hasScope({ grantedScopes, requiredScope: scope }));
}
