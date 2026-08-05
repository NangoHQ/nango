import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { hasScope } from '../../middleware/scope.middleware.js';
import { recordControlPlaneMcpAudit } from './audit.js';
import { createIntegrationsTool } from './integrations/create.js';
import { getIntegrationsTool } from './integrations/get.js';
import { listIntegrationsTool } from './integrations/list.js';
import { getLogOperationTool } from './logs/getOperation.js';
import { listLogOperationsTool } from './logs/listOperations.js';
import { handleMcpToolError, jsonStructuredContent } from './utils.js';

import type { ControlPlaneMcpContext, ControlPlaneMcpRequiredScopes, ControlPlaneMcpTool } from './controlPlaneTool.js';
import type { AnySchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { ApiKeyScope } from '@nangohq/types';

const controlPlaneMcpTools: ControlPlaneMcpTool[] = [
    listIntegrationsTool,
    getIntegrationsTool,
    createIntegrationsTool,
    listLogOperationsTool,
    getLogOperationTool
];

export function createControlPlaneMcpServer(context: ControlPlaneMcpContext): McpServer {
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

    for (const toolDefinition of controlPlaneMcpTools) {
        // Need to cast because we have a different Zod version than the MCP SDK
        const config = {
            description: toolDefinition.description,
            inputSchema: toolDefinition.inputSchema as unknown as AnySchema,
            ...(toolDefinition.outputSchema ? { outputSchema: toolDefinition.outputSchema as unknown as AnySchema } : {}),
            ...(toolDefinition.annotations ? { annotations: toolDefinition.annotations } : {})
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

        if (!hasRequiredScopes({ grantedScopes: context.grantedScopes, requiredScopes: toolDefinition.requiredScopes })) {
            // Disabled tools are omitted from tools/list and rejected by the SDK if called.
            registeredTool.disable();
        }
    }

    return server;
}

/**
 * Record authorization failures that cannot be audited by the normal tool wrapper.
 * Tools for which the caller lacks scopes are disabled, so the MCP SDK rejects their calls without invoking their handlers.
 * The body can contain one JSON-RPC request or a batch; tool arguments are deliberately never inspected.
 */
export function auditDeniedControlPlaneMcpCalls(body: unknown, context: ControlPlaneMcpContext): void {
    if (!context.audit) {
        return;
    }

    const requests = Array.isArray(body) ? body : [body];
    for (const request of requests) {
        const requestObject = typeof request === 'object' && request !== null ? (request as Record<string, unknown>) : undefined;
        const params = requestObject?.['params'];
        const paramsObject = typeof params === 'object' && params !== null ? (params as Record<string, unknown>) : undefined;
        if (requestObject?.['method'] !== 'tools/call' || !paramsObject) {
            continue;
        }

        const name = paramsObject['name'];
        if (typeof name !== 'string') {
            continue;
        }

        const tool = controlPlaneMcpTools.find((candidate) => candidate.name === name);
        // An unknown tool is not an authorization denial. The MCP SDK will report that it does not exist.
        if (!tool) {
            continue;
        }

        if (tool.audit.kind === 'no-audit') {
            continue;
        }

        // Authorized calls reach the tool wrapper, which records their success or failure.
        if (hasRequiredScopes({ grantedScopes: context.grantedScopes, requiredScopes: tool.requiredScopes })) {
            continue;
        }

        recordControlPlaneMcpAudit({
            account: context.account,
            environment: context.environment,
            auditContext: context.audit,
            policy: tool.audit,
            outcome: 'denied'
        });
    }
}

function hasRequiredScopes({ grantedScopes, requiredScopes }: { grantedScopes: string[] | undefined; requiredScopes: ControlPlaneMcpRequiredScopes }): boolean {
    const hasRequiredScope = (scope: ApiKeyScope) => hasScope({ grantedScopes, requiredScope: scope });
    return 'every' in requiredScopes ? requiredScopes.every.every(hasRequiredScope) : requiredScopes.anyOf.some(hasRequiredScope);
}
