import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod/v4';

import { PUBLIC_ENVIRONMENT_SCOPES } from '@nangohq/authz';
import { getLogger, hasApiKeyScope } from '@nangohq/utils';

import { authorizes } from '../../authz/resolve.js';
import { triggerActionTool } from './actions/trigger.js';
import { recordManagementMcpAudit } from './audit.js';
import { getConnectionsTool } from './connections/get.js';
import { listConnectionsTool } from './connections/list.js';
import { createConnectSessionTool } from './connectSessions/create.js';
import { queryDocsFilesystemTool } from './docs/queryFilesystem.js';
import { searchDocsTool } from './docs/search.js';
import { listEnvironmentsTool } from './environments/list.js';
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
import { emptyObjectJsonSchema, handleMcpToolError, jsonStructuredContent, PublicMcpError, toJsonSchema202012 } from './utils.js';

import type { RequestLocals } from '../../utils/express.js';
import type { ManagementMcpContext, ManagementMcpRequiredScopes, ManagementMcpTool } from './managementTool.js';
import type { AnySchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ApiKeyScope, AuditPolicy, DBEnvironment, DBUser } from '@nangohq/types';

const logger = getLogger('Server.ManagementMcpServer');
const environmentArgumentSchema = z.object({ environment: z.string().trim().min(1).max(255) }).loose();

export type ManagementMcpServerContext =
    | ManagementMcpContext
    | (Omit<ManagementMcpContext, 'authorizedEnvironments' | 'environment' | 'user'> & {
          authorizedEnvironments: DBEnvironment[];
          user: DBUser;
          environment?: never;
      });

const managementMcpTools: ManagementMcpTool[] = [
    searchDocsTool,
    queryDocsFilesystemTool,
    getProvidersTool,
    listEnvironmentsTool,
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

export function createManagementMcpServer(context: ManagementMcpServerContext, requestBody?: unknown): McpServer {
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

    const environmentArgumentRequired = context.environment === undefined;
    const toolCallArgumentsByName = parseToolCallArguments(requestBody);
    const listedTools: ManagementMcpTool[] = [];
    const tools = environmentArgumentRequired ? managementMcpTools : managementMcpTools.filter((tool) => tool !== listEnvironmentsTool);
    for (const toolDefinition of tools) {
        // callArguments is an array of args, one element per tool call. This is because MCP SDK supports batching, so
        // we can end up with multiple tool calls to the same tool. This is also the reason why we need to do loops over
        // args auditDeniedCallsForTool and auditInvalidDynamicCallsForTool - some of the tool calls to the same tool
        // call might be valid and some might not
        const callArguments = toolCallArgumentsByName.get(toolDefinition.name) ?? [];

        // Need to cast because we have a different Zod version than the MCP SDK
        const config = {
            description: toolDefinition.description,
            inputSchema: (environmentArgumentRequired && toolDefinition.environmentTarget
                ? environmentArgumentSchema
                : toolDefinition.inputSchema) as unknown as AnySchema,
            ...(toolDefinition.outputSchema ? { outputSchema: toolDefinition.outputSchema as unknown as AnySchema } : {}),
            ...(toolDefinition.annotations ? { annotations: toolDefinition.annotations } : {})
        };
        const registeredTool = server.registerTool(toolDefinition.name, config, async (args: unknown) => {
            try {
                const invocation = resolveToolInvocation({ args, context, tool: toolDefinition });
                if (!hasRequiredScopes({ grantedScopes: invocation.context.grantedScopes, requiredScopes: toolDefinition.requiredScopes })) {
                    auditDeniedToolInvocation({ args: invocation.args, context: invocation.context, tool: toolDefinition });
                    throw new PublicMcpError(
                        `You do not have permission to use ${toolDefinition.name} in the ${invocation.context.environment.name} environment.`
                    );
                }
                const result = await toolDefinition.handler(invocation.args, invocation.context);
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
        tools: listedTools.map((tool) => toListedTool(tool, environmentArgumentRequired))
    }));

    return server;
}

function toListedTool(tool: ManagementMcpTool, environmentArgumentRequired: boolean): Tool {
    const baseInputSchema = toJsonSchema202012(tool.inputSchema, 'input') ?? emptyObjectJsonSchema;
    const inputSchema = environmentArgumentRequired && tool.environmentTarget ? addEnvironmentArgument(baseInputSchema) : baseInputSchema;
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

function addEnvironmentArgument(inputSchema: Tool['inputSchema']): Tool['inputSchema'] {
    return {
        ...inputSchema,
        properties: {
            environment: {
                type: 'string',
                minLength: 1,
                maxLength: 255,
                description: 'Name of an environment authorized for this OAuth session. Call environments_list to see allowed values.'
            },
            ...inputSchema.properties
        },
        required: [...new Set(['environment', ...(inputSchema.required ?? [])])]
    };
}

function resolveToolInvocation({ args, context, tool }: { args: unknown; context: ManagementMcpServerContext; tool: ManagementMcpTool }): {
    args: unknown;
    context: ManagementMcpContext;
} {
    if (context.environment) {
        return { args, context };
    }

    if (!tool.environmentTarget) {
        const environment = context.authorizedEnvironments[0];
        if (!environment) {
            throw new PublicMcpError('This OAuth session has no authorized environments.');
        }
        return { args, context: createOAuthEnvironmentContext(context, environment) };
    }

    if (typeof args !== 'object' || args === null || Array.isArray(args)) {
        throw new PublicMcpError(`Invalid arguments for ${tool.name}: environment is required.`);
    }
    const { environment: requestedEnvironment, ...toolArgs } = args as Record<string, unknown>;
    if (typeof requestedEnvironment !== 'string' || requestedEnvironment.length === 0 || requestedEnvironment.length > 255) {
        throw new PublicMcpError(`Invalid arguments for ${tool.name}: environment is required.`);
    }

    const environment = context.authorizedEnvironments.find((candidate) => candidate.name === requestedEnvironment);
    if (!environment) {
        throw new PublicMcpError('The requested environment is not authorized for this OAuth session. Call environments_list to see allowed values.');
    }

    return { args: toolArgs, context: createOAuthEnvironmentContext(context, environment) };
}

function createOAuthEnvironmentContext(context: Exclude<ManagementMcpServerContext, ManagementMcpContext>, environment: DBEnvironment): ManagementMcpContext {
    const locals: Partial<RequestLocals> = {
        user: context.user,
        account: context.account,
        plan: context.plan,
        environment
    };
    const grantedScopes = PUBLIC_ENVIRONMENT_SCOPES.filter(
        (scope) => hasApiKeyScope({ grantedScopes: context.grantedScopes, requiredScope: scope }) && authorizes(locals, scope)
    );

    return { ...context, environment, grantedScopes };
}

function auditDeniedToolInvocation({ args, context, tool }: { args: unknown; context: ManagementMcpContext; tool: ManagementMcpTool }): void {
    if (!context.audit || tool.audit.kind === 'no-audit') {
        return;
    }

    try {
        const policy = tool.audit.kind === 'dynamic-audit' ? tool.audit.resolvePolicy(args, context) : tool.audit;
        if (!policy) {
            return;
        }
        recordManagementMcpAudit({
            account: context.account,
            environment: context.environment,
            plan: context.plan,
            auditContext: context.audit,
            policy,
            outcome: 'denied'
        });
    } catch {
        logger.error('Failed to resolve Management MCP denied-call audit policy', { toolName: tool.name });
    }
}

function auditDeniedCallsForTool({
    callArguments,
    context,
    tool
}: {
    callArguments: readonly unknown[];
    context: ManagementMcpServerContext;
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
        try {
            const invocation = resolveToolInvocation({ args, context, tool });
            auditDeniedToolInvocation({ args: invocation.args, context: invocation.context, tool });
        } catch (err) {
            if (!(err instanceof PublicMcpError)) {
                logger.error('Failed to resolve Management MCP denied-call audit policy', { toolName: tool.name });
            }
        }
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
    context: ManagementMcpServerContext;
    tool: ManagementMcpTool;
}): void {
    if (!context.audit || tool.audit.kind !== 'dynamic-audit' || (context.environment === undefined && tool.environmentTarget)) {
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
            const invocation = resolveToolInvocation({ args, context, tool });
            policy = tool.audit.resolvePolicy(invocation.args, invocation.context);
            if (!policy) {
                continue;
            }
            recordManagementMcpAudit({
                account: invocation.context.account,
                environment: invocation.context.environment,
                plan: invocation.context.plan,
                auditContext: context.audit,
                policy,
                outcome: 'failure'
            });
        } catch (err) {
            if (!(err instanceof PublicMcpError)) {
                logger.error('Failed to resolve Management MCP invalid-call audit policy', { toolName: tool.name });
            }
        }
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
