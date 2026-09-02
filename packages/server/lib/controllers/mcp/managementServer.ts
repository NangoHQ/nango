import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { getLogger, hasApiKeyScope } from '@nangohq/utils';

import { triggerActionTool } from './actions/trigger.js';
import { recordManagementMcpAudit } from './audit.js';
import { getConnectionsTool } from './connections/get.js';
import { listConnectionsTool } from './connections/list.js';
import { createConnectSessionTool } from './connectSessions/create.js';
import { queryDocsFilesystemTool } from './docs/queryFilesystem.js';
import { searchDocsTool } from './docs/search.js';
import { deployFunctionTool } from './functions/deployFunction.js';
import { deployTemplateTool } from './functions/deployTemplate.js';
import { getDeploymentStatusTool } from './functions/getDeploymentStatus.js';
import { listFunctionsTool } from './functions/list.js';
import { createIntegrationsTool } from './integrations/create.js';
import { deleteIntegrationsTool } from './integrations/delete.js';
import { getIntegrationsTool } from './integrations/get.js';
import { listIntegrationsTool } from './integrations/list.js';
import { updateIntegrationsTool } from './integrations/update.js';
import { getLogOperationTool } from './logs/getOperation.js';
import { listLogOperationsTool } from './logs/listOperations.js';
import { getProvidersTool } from './providers/get.js';
import { proxyRequestTool } from './proxy/request.js';
import { setSyncsStateTool } from './syncs/setState.js';
import { triggerSyncsTool } from './syncs/trigger.js';
import { emptyObjectJsonSchema, handleMcpToolError, jsonStructuredContent, toJsonSchema202012 } from './utils.js';

import type { ManagementMcpContext, ManagementMcpRequiredScopes, ManagementMcpTool } from './managementTool.js';
import type { AnySchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ApiKeyScope, AuditPolicy } from '@nangohq/types';

const logger = getLogger('Server.ManagementMcpServer');

const managementMcpTools: ManagementMcpTool[] = [
    searchDocsTool,
    queryDocsFilesystemTool,
    getProvidersTool,
    createConnectSessionTool,
    listIntegrationsTool,
    getIntegrationsTool,
    createIntegrationsTool,
    updateIntegrationsTool,
    deleteIntegrationsTool,
    listConnectionsTool,
    getConnectionsTool,
    setSyncsStateTool,
    triggerSyncsTool,
    triggerActionTool,
    proxyRequestTool,
    listFunctionsTool,
    deployFunctionTool,
    deployTemplateTool,
    getDeploymentStatusTool,
    listLogOperationsTool,
    getLogOperationTool
];

export function createManagementMcpServer(context: ManagementMcpContext, requestBody?: unknown): McpServer {
    const server = new McpServer(
        {
            name: 'Nango Management MCP server',
            version: '1.0.0'
        },
        {
            capabilities: {
                tools: {}
            }
        }
    );

    const toolCallArgumentsByName = parseToolCallArguments(requestBody);
    const listedTools: ManagementMcpTool[] = [];
    for (const toolDefinition of managementMcpTools) {
        // callArguments is an array of args, one element per tool call. This is because MCP SDK supports batching, so
        // we can end up with multiple tool calls to the same tool. This is also the reason why we need to do loops over
        // args auditDeniedCallsForTool and auditInvalidDynamicCallsForTool - some of the tool calls to the same tool
        // call might be valid and some might not
        const callArguments = toolCallArgumentsByName.get(toolDefinition.name) ?? [];

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
            auditDeniedCallsForTool({ callArguments, context, tool: toolDefinition });
            // Disabled tools are omitted from tools/list and rejected by the SDK if called.
            registeredTool.disable();
            continue;
        }

        auditInvalidDynamicCallsForTool({ callArguments, context, tool: toolDefinition });
        listedTools.push(toolDefinition);
    }

    server.server.setRequestHandler(ListToolsRequestSchema, () => ({
        tools: listedTools.map(toListedTool)
    }));

    return server;
}

function toListedTool(tool: ManagementMcpTool): Tool {
    const inputSchema = toJsonSchema202012(tool.inputSchema, 'input') ?? emptyObjectJsonSchema;
    const outputSchema = tool.outputSchema ? toJsonSchema202012(tool.outputSchema, 'output') : undefined;

    return {
        name: tool.name,
        description: tool.description,
        inputSchema,
        ...(outputSchema ? { outputSchema } : {}),
        ...(tool.annotations ? { annotations: tool.annotations } : {}),
        execution: { taskSupport: 'forbidden' }
    };
}

function auditDeniedCallsForTool({
    callArguments,
    context,
    tool
}: {
    callArguments: readonly unknown[];
    context: ManagementMcpContext;
    tool: ManagementMcpTool;
}): void {
    if (!context.audit || tool.audit.kind === 'no-audit') {
        return;
    }

    // Disabled tools never reach their handlers, so their denied calls must be audited while permissions are checked.
    // arguments, targets, and metadata are never added to denied events.
    // We need to iterate over callArguments because we can receive a batch of calls to the same tool here, each element of
    // callArguments is a separate tool call.
    for (const args of callArguments) {
        let policy: AuditPolicy | undefined;
        try {
            policy = tool.audit.kind === 'dynamic-audit' ? tool.audit.resolvePolicy(args, context) : tool.audit;
        } catch {
            logger.error('Failed to resolve Management MCP denied-call audit policy', { toolName: tool.name });
            continue;
        }
        if (!policy) {
            continue;
        }

        recordManagementMcpAudit({
            account: context.account,
            environment: context.environment,
            plan: context.plan,
            auditContext: context.audit,
            policy,
            outcome: 'denied'
        });
    }
}

/**
 * Check if it's possible to parse arguments and audit an invalid call if not. This can't be done inside of
 * the tool because the MCP SDK rejects invalid arguments before invoking the registered handler.
 */
function auditInvalidDynamicCallsForTool({
    callArguments,
    context,
    tool
}: {
    callArguments: readonly unknown[];
    context: ManagementMcpContext;
    tool: ManagementMcpTool;
}): void {
    if (!context.audit || tool.audit.kind !== 'dynamic-audit') {
        return;
    }

    const inputSchema = tool.inputSchema as { safeParse?: ((value: unknown) => { success: boolean }) | undefined };
    if (typeof inputSchema.safeParse !== 'function') {
        return;
    }

    // We need to iterate over callArguments because we can receive a batch of calls to the same tool here, each element of
    // callArguments is a separate tool call.
    for (const args of callArguments) {
        let policy: AuditPolicy | undefined;
        try {
            if (inputSchema.safeParse(args ?? {}).success) {
                continue;
            }
            policy = tool.audit.resolvePolicy(args, context);
        } catch {
            logger.error('Failed to resolve Management MCP invalid-call audit policy', { toolName: tool.name });
            continue;
        }
        if (!policy) {
            continue;
        }

        recordManagementMcpAudit({
            account: context.account,
            environment: context.environment,
            plan: context.plan,
            auditContext: context.audit,
            policy,
            outcome: 'failure'
        });
    }
}

/** Group raw arguments by tool name from a single JSON-RPC request or batch before the MCP SDK dispatches it. */
function parseToolCallArguments(requestBody: unknown): Map<string, unknown[]> {
    const requests = Array.isArray(requestBody) ? requestBody : [requestBody];
    const toolCallArguments = new Map<string, unknown[]>();
    for (const request of requests) {
        const requestObject = typeof request === 'object' && request !== null ? (request as Record<string, unknown>) : undefined;
        const params = requestObject?.['params'];
        const paramsObject = typeof params === 'object' && params !== null ? (params as Record<string, unknown>) : undefined;
        const toolName = paramsObject?.['name'];
        if (requestObject?.['method'] !== 'tools/call' || !paramsObject || typeof toolName !== 'string') {
            continue;
        }

        const args = toolCallArguments.get(toolName) ?? [];
        args.push(paramsObject['arguments']);
        toolCallArguments.set(toolName, args);
    }
    return toolCallArguments;
}

function hasRequiredScopes({ grantedScopes, requiredScopes }: { grantedScopes: string[] | undefined; requiredScopes: ManagementMcpRequiredScopes }): boolean {
    if ('none' in requiredScopes) {
        return true;
    }

    const hasRequiredScope = (scope: ApiKeyScope) => hasApiKeyScope({ grantedScopes, requiredScope: scope });
    return 'every' in requiredScopes ? requiredScopes.every.every(hasRequiredScope) : requiredScopes.anyOf.some(hasRequiredScope);
}
