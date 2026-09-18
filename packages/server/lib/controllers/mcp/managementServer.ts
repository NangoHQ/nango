import { fromJsonSchema, McpServer } from '@modelcontextprotocol/server';

import { authorizeIn, PUBLIC_ENVIRONMENT_SCOPES } from '@nangohq/authz';
import { getLogger, hasApiKeyScope, metrics } from '@nangohq/utils';

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
import { handleMcpToolError, jsonStructuredContent, mcpToolError, toJsonSchema202012 } from './utils.js';

import type { ManagementMcpEnvironment } from './environments/list.js';
import type { ManagementMcpContext, ManagementMcpRequiredScopes, ManagementMcpTool } from './managementTool.js';
import type { Principal } from '@nangohq/authz';
import type { ApiKeyScope, AuditAttribution, AuditPolicy, DBEnvironment, DBPlan, DBTeam } from '@nangohq/types';

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

// Schema conversion compiles AJV validators, so do it once rather than for every stateless MCP request.
const managementMcpToolRegistrations = managementMcpTools.map((toolDefinition) => {
    const inputSchema = toJsonSchema202012(toolDefinition.inputSchema, 'input');
    const sharedConfig = {
        description: toolDefinition.description,
        ...(toolDefinition.outputSchema ? { outputSchema: fromJsonSchema(toJsonSchema202012(toolDefinition.outputSchema, 'output')) } : {}),
        ...(toolDefinition.annotations ? { annotations: toolDefinition.annotations } : {})
    };

    return {
        toolDefinition,
        apiKeyConfig: {
            ...sharedConfig,
            inputSchema: fromJsonSchema(inputSchema)
        },
        oauthConfig: {
            ...sharedConfig,
            inputSchema: fromJsonSchema(withRequiredEnvironment(inputSchema))
        }
    };
});

const environmentsListToolConfig = {
    description: listEnvironmentsTool.description,
    inputSchema: fromJsonSchema(toJsonSchema202012(listEnvironmentsTool.inputSchema, 'input')),
    outputSchema: fromJsonSchema(toJsonSchema202012(listEnvironmentsTool.outputSchema, 'output')),
    annotations: listEnvironmentsTool.annotations
};

const oauthUnsupportedToolNames = new Set([deployFunctionTool.name, proxyRequestTool.name]);

export type ManagementMcpServerAuthentication = { type: 'apiKey'; context: ManagementMcpContext } | { type: 'oauth'; context: ManagementMcpOAuthContext };

interface ManagementMcpOAuthContext {
    account: DBTeam;
    plan: DBPlan | null;
    principal: Principal;
    environments: readonly ManagementMcpEnvironment[];
    loadEnvironment: (name: string) => Promise<DBEnvironment | null>;
    audit?: AuditAttribution | undefined;
}

type ResolvedOAuthToolCall = { ok: true; toolArguments: Record<string, unknown>; context: ManagementMcpContext } | { ok: false; message: string };
type OAuthToolCallResolver = (args: unknown) => Promise<ResolvedOAuthToolCall>;

export async function createManagementMcpServer(authentication: ManagementMcpServerAuthentication, requestBody?: unknown): Promise<McpServer> {
    if (authentication.type === 'oauth') {
        return await createOAuthManagementMcpServer(authentication.context, requestBody);
    }
    return createApiKeyManagementMcpServer(authentication.context, requestBody);
}

function createApiKeyManagementMcpServer(context: ManagementMcpContext, requestBody: unknown): McpServer {
    const server = createBaseManagementMcpServer();
    const toolCallArgumentsByName = parseToolCallArguments(requestBody);
    for (const { toolDefinition, apiKeyConfig } of managementMcpToolRegistrations) {
        // callArguments is an array of args, one element per tool call. This is because MCP SDK supports batching, so
        // we can end up with multiple tool calls to the same tool. This is also the reason why we need to do loops over
        // args auditDeniedCallsForTool and auditInvalidDynamicCallsForTool - some of the tool calls to the same tool
        // call might be valid and some might not
        const callArguments = toolCallArgumentsByName.get(toolDefinition.name) ?? [];

        const registeredTool = server.registerTool(toolDefinition.name, apiKeyConfig, (args: unknown) =>
            invokeManagementMcpTool(toolDefinition, args, context)
        );

        if (!hasRequiredScopes({ grantedScopes: context.grantedScopes, requiredScopes: toolDefinition.requiredScopes })) {
            auditDeniedCallsForTool({ callArguments, context, tool: toolDefinition });
            // Disabled tools are omitted from tools/list and rejected by the SDK if called.
            registeredTool.disable();
            continue;
        }

        auditInvalidDynamicCallsForTool({ callArguments, context, tool: toolDefinition });
    }

    return server;
}

async function createOAuthManagementMcpServer(oauthContext: ManagementMcpOAuthContext, requestBody: unknown): Promise<McpServer> {
    const server = createBaseManagementMcpServer();
    registerEnvironmentsListTool(server, oauthContext);
    const toolCallArgumentsByName = parseToolCallArguments(requestBody);
    const resolveOAuthToolCall = createOAuthToolCallResolver(oauthContext);

    for (const { toolDefinition, oauthConfig } of managementMcpToolRegistrations) {
        if (oauthUnsupportedToolNames.has(toolDefinition.name)) {
            continue;
        }

        const callArguments = toolCallArgumentsByName.get(toolDefinition.name) ?? [];
        await auditOAuthCallsBeforeDispatch({ callArguments, resolveOAuthToolCall, tool: toolDefinition });

        server.registerTool(toolDefinition.name, oauthConfig, async (args: unknown) => {
            try {
                const resolved = await resolveOAuthToolCall(args);
                if (!resolved.ok) {
                    recordEarlyOAuthToolError(oauthContext.account.id, toolDefinition.name);
                    return mcpToolError(resolved.message);
                }
                if (!hasRequiredScopes({ grantedScopes: resolved.context.grantedScopes, requiredScopes: toolDefinition.requiredScopes })) {
                    recordEarlyOAuthToolError(oauthContext.account.id, toolDefinition.name);
                    return mcpToolError('Insufficient permissions for this tool in the selected environment');
                }

                return await invokeManagementMcpTool(toolDefinition, resolved.toolArguments, resolved.context);
            } catch (err) {
                recordEarlyOAuthToolError(oauthContext.account.id, toolDefinition.name);
                return handleMcpToolError(err, toolDefinition.name);
            }
        });
    }

    return server;
}

function createBaseManagementMcpServer(): McpServer {
    return new McpServer(
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
}

async function invokeManagementMcpTool(tool: ManagementMcpTool, args: unknown, context: ManagementMcpContext) {
    try {
        const result = await tool.handler(args, context);
        if (result.isErr()) {
            return handleMcpToolError(result.error, tool.name);
        }

        return jsonStructuredContent(result.value);
    } catch (err) {
        return handleMcpToolError(err, tool.name);
    }
}

function createOAuthToolCallResolver(oauthContext: ManagementMcpOAuthContext): OAuthToolCallResolver {
    const environmentsByName = new Map<string, Promise<DBEnvironment | null>>();

    return async (args: unknown): Promise<ResolvedOAuthToolCall> => {
        if (!isRecord(args) || typeof args['environment'] !== 'string') {
            return { ok: false, message: 'An environment name is required' };
        }

        const environmentSummary = oauthContext.environments.find((candidate) => candidate.name === args['environment']);
        if (!environmentSummary || !authorizeIn(oauthContext.principal, 'environment:settings:read', environmentSummary)) {
            return { ok: false, message: 'Environment not found or inaccessible' };
        }

        let environmentPromise = environmentsByName.get(environmentSummary.name);
        if (!environmentPromise) {
            environmentPromise = oauthContext.loadEnvironment(environmentSummary.name);
            environmentsByName.set(environmentSummary.name, environmentPromise);
        }
        const environment = await environmentPromise;
        if (!environment || !authorizeIn(oauthContext.principal, 'environment:settings:read', environment)) {
            return { ok: false, message: 'Environment not found or inaccessible' };
        }

        const toolArguments = { ...args };
        delete toolArguments['environment'];
        const grantedScopes = PUBLIC_ENVIRONMENT_SCOPES.filter((scope) => authorizeIn(oauthContext.principal, scope, environment));

        return {
            ok: true,
            toolArguments,
            context: {
                account: oauthContext.account,
                environment,
                plan: oauthContext.plan,
                grantedScopes,
                audit: oauthContext.audit
            }
        };
    };
}

async function auditOAuthCallsBeforeDispatch({
    callArguments,
    resolveOAuthToolCall,
    tool
}: {
    callArguments: readonly unknown[];
    resolveOAuthToolCall: OAuthToolCallResolver;
    tool: ManagementMcpTool;
}): Promise<void> {
    for (const args of callArguments) {
        let resolved: ResolvedOAuthToolCall;
        try {
            resolved = await resolveOAuthToolCall(args);
        } catch {
            // The registered handler reports resolver failures through the normal MCP error path.
            continue;
        }
        if (!resolved.ok) {
            continue;
        }

        if (!hasRequiredScopes({ grantedScopes: resolved.context.grantedScopes, requiredScopes: tool.requiredScopes })) {
            auditDeniedCallsForTool({ callArguments: [resolved.toolArguments], context: resolved.context, tool });
            continue;
        }
        auditInvalidDynamicCallsForTool({ callArguments: [resolved.toolArguments], context: resolved.context, tool });
    }
}

function recordEarlyOAuthToolError(accountId: number, tool: string): void {
    metrics.increment(metrics.Types.MCP_TOOL_CALLS, 1, {
        accountId,
        mcp_type: 'management',
        tool,
        outcome: 'error'
    });
}

function registerEnvironmentsListTool(server: McpServer, context: ManagementMcpOAuthContext): void {
    server.registerTool(listEnvironmentsTool.name, environmentsListToolConfig, () => {
        try {
            const environments = context.environments.filter((environment) => authorizeIn(context.principal, 'environment:settings:read', environment));
            const result = listEnvironmentsTool.handler(environments);
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
    });
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

function withRequiredEnvironment(inputSchema: ReturnType<typeof toJsonSchema202012>): ReturnType<typeof toJsonSchema202012> {
    const properties = inputSchema.properties ?? {};
    if (Object.prototype.hasOwnProperty.call(properties, 'environment')) {
        throw new Error('Management MCP tool input schemas must not define environment');
    }

    return {
        ...inputSchema,
        properties: {
            environment: {
                type: 'string',
                minLength: 1,
                description: 'The name of the Nango environment in which to run the tool.'
            },
            ...properties
        },
        required: ['environment', ...(inputSchema.required ?? [])]
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
