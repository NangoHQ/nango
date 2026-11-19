import { fromJsonSchema, McpServer, ProtocolError, ProtocolErrorCode } from '@modelcontextprotocol/server';

import { buildSessionTools, withActionInputSchemas } from '../../../services/agentSessionToolCatalog.service/index.js';
import { createConnectionTool } from './createConnection/createConnection.js';
import { executeDirectToolCall } from './directCall.js';
import { executeTool } from './execute/execute.js';
import { proxyTool } from './proxy/proxy.js';
import { buildSessionInstructions } from './sessionInstructions.js';
import { callAgentSessionTool } from './sessionTool.js';
import { toolSearchTool } from './toolSearch/search.js';

import type { AgentSessionMcpContext, AgentSessionMcpTool } from './sessionTool.js';
import type { RegisteredTool, RequestId } from '@modelcontextprotocol/server';
import type { Result } from '@nangohq/utils';

export const TOOLS_PAGE_SIZE = 50;

const META_TOOLS: AgentSessionMcpTool[] = [toolSearchTool, executeTool, proxyTool, createConnectionTool];

/**
 * Without a declared input schema registerTool hands the callback its request extra, not the tool's
 * arguments. The SDK validates missing params.arguments as {}, while this open object accepts every
 * object-shaped tool input.
 */
const REGISTRATION_INPUT_SCHEMA = fromJsonSchema<Record<string, unknown>>({
    type: 'object',
    properties: {},
    additionalProperties: true
});

const INTEGRATION_TOOL_METRIC = 'integration_tool';

export function createAgentSessionMcpServer(params: Omit<AgentSessionMcpContext, 'callable'>, requestBody?: unknown): McpServer {
    const { session, account } = params;
    const originalToolArgumentsByRequestId = getOriginalToolArgumentsByRequestId(requestBody);

    const server = new McpServer(
        {
            name: 'Nango Agent Session MCP server',
            version: '1.0.0'
        },
        {
            capabilities: {
                tools: { listChanged: false }
            },
            instructions: buildSessionInstructions(session)
        }
    );

    const { listed, callable, actions } = buildSessionTools(session);
    const context: AgentSessionMcpContext = { ...params, callable };

    for (const tool of META_TOOLS) {
        const registered = register({
            name: tool.name,
            description: tool.description,
            metric: tool.name,
            structured: Boolean(tool.outputSchema),
            run: async (args) => await tool.handler(args, context)
        });

        if (!tool.isEnabled(session.metaTools)) {
            // Disabled tools are omitted from tools/list and rejected by the SDK if called.
            registered.disable();
        }
    }

    /**
     * Registering a tool is what makes it callable by name, listing it is only what makes a client
     * discover it. So a searchable tool answers to its name even though tools/list never offers it,
     * and a client that calls only what it listed reaches it through nango_execute instead.
     */
    for (const [name, tool] of callable) {
        register({
            name,
            description: tool.description,
            metric: INTEGRATION_TOOL_METRIC,
            run: async (args, requestId) => {
                // MCP SDK v2 normalizes an omitted params.arguments to {} before invoking a tool.
                // Use the untouched JSON-RPC body so no-input Nango actions still receive undefined;
                // an explicit {} remains {} and is validated as provided input.
                const original = originalToolArgumentsByRequestId.has(requestId) ? originalToolArgumentsByRequestId.get(requestId) : args;
                return await executeDirectToolCall({ name, tool, args: original, context });
            }
        });
    }

    function register({
        name,
        description,
        metric,
        structured = false,
        run
    }: {
        name: string;
        description: string;
        metric: string;
        structured?: boolean;
        run: (args: unknown, requestId: RequestId) => Promise<Result<unknown>>;
    }): RegisteredTool {
        return server.registerTool(name, { description, inputSchema: REGISTRATION_INPUT_SCHEMA }, async (args: unknown, ctx) =>
            callAgentSessionTool({ metric, accountId: account.id, structured, run: async () => await run(args, ctx.mcpReq.id) })
        );
    }

    server.server.setRequestHandler('tools/list', async (request) => {
        const offset = decodeCursor(request.params?.cursor);
        const page = listed.slice(offset, offset + TOOLS_PAGE_SIZE);
        const next = offset + page.length;
        const tools = await withActionInputSchemas({ page, actions, environmentId: session.environmentId });

        return {
            tools,
            ...(next < listed.length ? { nextCursor: encodeCursor(next) } : {})
        };
    });

    return server;
}

/**
 * Capture tool arguments before MCP SDK validation. The SDK turns an omitted arguments member into
 * {}, so the raw body is the only place that still distinguishes omission from an explicit empty
 * object. JSON-RPC IDs keep each original value associated with the right call in a batch request.
 */
function getOriginalToolArgumentsByRequestId(requestBody: unknown): Map<RequestId, unknown> {
    const requests = Array.isArray(requestBody) ? requestBody : [requestBody];
    const argumentsByRequestId = new Map<RequestId, unknown>();

    for (const request of requests) {
        if (!isRecord(request)) {
            continue;
        }

        const method = request['method'];
        if (method !== 'tools/call') {
            continue;
        }

        const params = request['params'];
        if (!isRecord(params)) {
            continue;
        }

        const requestId = request['id'];
        if (typeof requestId !== 'string' && typeof requestId !== 'number') {
            continue;
        }

        const toolArguments = params['arguments'];
        argumentsByRequestId.set(requestId, toolArguments);
    }

    return argumentsByRequestId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function encodeCursor(offset: number): string {
    return Buffer.from(String(offset), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | undefined): number {
    if (cursor === undefined) {
        return 0;
    }

    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    if (!/^\d+$/.test(decoded)) {
        throw new ProtocolError(ProtocolErrorCode.InvalidParams, 'Invalid cursor');
    }

    return parseInt(decoded, 10);
}
