import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { normalizeObjectSchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod/v4';

import { hasApiKeyScope } from '@nangohq/utils';

import { recordManagementMcpAudit } from './audit.js';
import { getConnectionsTool } from './connections/get.js';
import { listConnectionsTool } from './connections/list.js';
import { createConnectSessionTool } from './connectSessions/create.js';
import { createIntegrationsTool } from './integrations/create.js';
import { deleteIntegrationsTool } from './integrations/delete.js';
import { getIntegrationsTool } from './integrations/get.js';
import { listIntegrationsTool } from './integrations/list.js';
import { updateIntegrationsTool } from './integrations/update.js';
import { getLogOperationTool } from './logs/getOperation.js';
import { listLogOperationsTool } from './logs/listOperations.js';
import { proxyRequestTool } from './proxy/request.js';
import { handleMcpToolError, jsonStructuredContent } from './utils.js';

import type { ManagementMcpContext, ManagementMcpRequiredScopes, ManagementMcpTool } from './managementTool.js';
import type { AnySchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ApiKeyScope } from '@nangohq/types';

const jsonSchema202012 = 'https://json-schema.org/draft/2020-12/schema';
const emptyObjectJsonSchema: Tool['inputSchema'] = { type: 'object', properties: {} };

const managementMcpTools: ManagementMcpTool[] = [
    createConnectSessionTool,
    listIntegrationsTool,
    getIntegrationsTool,
    createIntegrationsTool,
    updateIntegrationsTool,
    deleteIntegrationsTool,
    listConnectionsTool,
    getConnectionsTool,
    proxyRequestTool,
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

    const listedTools: ManagementMcpTool[] = [];
    for (const toolDefinition of managementMcpTools) {
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
            auditDeniedCallsForTool({ requestBody, context, tool: toolDefinition });
            // Disabled tools are omitted from tools/list and rejected by the SDK if called.
            registeredTool.disable();
            continue;
        }

        listedTools.push(toolDefinition);
    }

    // MCP SDK 1.30 defaults Zod v4 conversion to draft-07 and does not expose a target option through registerTool.
    // TODO(NAN-6651): Remove this tools/list override after the MCP SDK emits JSON Schema 2020-12.
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

function toJsonSchema202012(schema: ManagementMcpTool['inputSchema'], io: 'input' | 'output'): Tool['inputSchema'] | undefined {
    const objectSchema = normalizeObjectSchema(schema);
    if (!objectSchema) {
        return undefined;
    }

    const jsonSchema = z.toJSONSchema(objectSchema as z.ZodType, { target: 'draft-2020-12', io });
    if (jsonSchema.type !== 'object' || jsonSchema.$schema !== jsonSchema202012) {
        throw new Error(`Failed to generate a JSON Schema 2020-12 object for an MCP tool ${io} schema`);
    }

    return jsonSchema as Tool['inputSchema'];
}

function auditDeniedCallsForTool({ requestBody, context, tool }: { requestBody: unknown; context: ManagementMcpContext; tool: ManagementMcpTool }): void {
    if (!context.audit || tool.audit.kind === 'no-audit') {
        return;
    }

    // Disabled tools never reach their handlers, so their denied calls must be audited while permissions are checked.
    // The body can contain one JSON-RPC request or a batch; tool arguments are deliberately never inspected.
    const requests = Array.isArray(requestBody) ? requestBody : [requestBody];
    for (const request of requests) {
        const requestObject = typeof request === 'object' && request !== null ? (request as Record<string, unknown>) : undefined;
        const params = requestObject?.['params'];
        const paramsObject = typeof params === 'object' && params !== null ? (params as Record<string, unknown>) : undefined;
        if (requestObject?.['method'] !== 'tools/call' || !paramsObject) {
            continue;
        }

        if (paramsObject['name'] !== tool.name) {
            continue;
        }

        recordManagementMcpAudit({
            account: context.account,
            environment: context.environment,
            plan: context.plan,
            auditContext: context.audit,
            policy: tool.audit,
            outcome: 'denied'
        });
    }
}

function hasRequiredScopes({ grantedScopes, requiredScopes }: { grantedScopes: string[] | undefined; requiredScopes: ManagementMcpRequiredScopes }): boolean {
    const hasRequiredScope = (scope: ApiKeyScope) => hasApiKeyScope({ grantedScopes, requiredScope: scope });
    return 'every' in requiredScopes ? requiredScopes.every.every(hasRequiredScope) : requiredScopes.anyOf.some(hasRequiredScope);
}
