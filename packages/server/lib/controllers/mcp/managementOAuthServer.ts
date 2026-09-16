import { fromJsonSchema, McpServer } from '@modelcontextprotocol/server';

import { metrics } from '@nangohq/utils';

import { listEnvironmentsTool } from './environments/list.js';
import { handleMcpToolError, jsonStructuredContent, toJsonSchema202012 } from './utils.js';

import type { ManagementMcpEnvironment } from './environments/list.js';
import type { DBTeam } from '@nangohq/types';

export function createManagementMcpOAuthServer(context: { account: DBTeam; environments: ManagementMcpEnvironment[] }): McpServer {
    const server = new McpServer(
        {
            name: 'Nango Management MCP server',
            version: '1.0.0'
        },
        {
            capabilities: {
                tools: { listChanged: false }
            }
        }
    );

    server.registerTool(
        listEnvironmentsTool.name,
        {
            description: listEnvironmentsTool.description,
            inputSchema: fromJsonSchema(toJsonSchema202012(listEnvironmentsTool.inputSchema, 'input')),
            outputSchema: fromJsonSchema(toJsonSchema202012(listEnvironmentsTool.outputSchema, 'output')),
            annotations: listEnvironmentsTool.annotations
        },
        () => {
            try {
                const result = listEnvironmentsTool.handler(context.environments);
                metrics.increment(metrics.Types.MCP_TOOL_CALLS, 1, {
                    accountId: context.account.id,
                    mcp_type: 'management',
                    tool: listEnvironmentsTool.name,
                    outcome: 'success'
                });
                return jsonStructuredContent(result);
            } catch (err) {
                metrics.increment(metrics.Types.MCP_TOOL_CALLS, 1, {
                    accountId: context.account.id,
                    mcp_type: 'management',
                    tool: listEnvironmentsTool.name,
                    outcome: 'error'
                });
                return handleMcpToolError(err, listEnvironmentsTool.name);
            }
        }
    );

    return server;
}
