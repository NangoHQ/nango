import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod/v4';

import { emptyObjectJsonSchema, toJsonSchema202012 } from '../../mcp/utils.js';
import { executeSessionTool, executeTool } from './execute/execute.js';
import { callAgentSessionTool, MAX_TOOL_NAME_LENGTH } from './sessionTool.js';
import { toolSearchTool } from './toolSearch/search.js';

import type { AgentSessionMcpContext, AgentSessionMcpTool } from './sessionTool.js';
import type { RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AnySchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { AgentSession } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export const TOOLS_PAGE_SIZE = 50;

/**
 * A tool name is unique across the whole server, but an action name is only unique within its
 * integration, so the listed name is qualified. `_meta` carries both halves back, and it, not
 * the name, is what a caller reads to know what a tool points at.
 */
export const TOOL_NAME_SEPARATOR = '__';

export const INTEGRATION_META_KEY = 'nango/integration';
export const TOOL_META_KEY = 'nango/tool';

const MAX_NAME_PART_LENGTH = 30;
const UNSAFE_NAME_CHARACTERS = /[^a-zA-Z0-9_-]/g;

const JSON_SCHEMA_2020_12 = 'https://json-schema.org/draft/2020-12/schema';

type SessionTool = Tool & { description: string };

const META_TOOLS: AgentSessionMcpTool[] = [toolSearchTool, executeTool];

/**
 * The compiled toolset stores a name and a description per tool, not an argument schema, so a
 * pinned tool is listed as accepting a free-form object.
 */
const PINNED_TOOL_INPUT_SCHEMA: Tool['inputSchema'] = {
    $schema: JSON_SCHEMA_2020_12,
    type: 'object',
    properties: {},
    additionalProperties: true
};

/**
 * Without a declared input schema registerTool hands the callback its request extra, not the tool's
 * arguments. Optional because params.arguments is, and a tool that takes none is called without it.
 */
const REGISTRATION_INPUT_SCHEMA = z.looseObject({}).optional() as unknown as AnySchema;

const INTEGRATION_TOOL_METRIC = 'integration_tool';

export function createAgentSessionMcpServer(params: Omit<AgentSessionMcpContext, 'callable'>): McpServer {
    const { session, account } = params;

    const server = new McpServer(
        {
            name: 'Nango Agent Session MCP server',
            version: '1.0.0'
        },
        {
            capabilities: {
                tools: {}
            }
        }
    );

    const { listed, callable } = buildSessionTools(session);
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
     *
     * A tool whose input is an array, string, number or boolean is reachable only through
     * nango_execute either way, because MCP requires tool arguments to be an object and there the
     * input is a nested field. A null-root input is fine here, called with no arguments at all.
     */
    for (const [name, tool] of callable) {
        register({
            name,
            description: tool.description,
            metric: INTEGRATION_TOOL_METRIC,
            run: async (args) => await executeSessionTool({ integrationId: tool.integrationId, toolName: tool.name, input: args, context })
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
        run: (args: unknown) => Promise<Result<unknown>>;
    }): RegisteredTool {
        return server.registerTool(name, { description, inputSchema: REGISTRATION_INPUT_SCHEMA }, async (args: unknown) =>
            callAgentSessionTool({ metric, accountId: account.id, structured, run: async () => await run(args) })
        );
    }

    server.server.setRequestHandler(ListToolsRequestSchema, (request) => {
        const offset = decodeCursor(request.params?.cursor);
        const page = listed.slice(offset, offset + TOOLS_PAGE_SIZE);
        const next = offset + page.length;

        return {
            tools: page.map((tool) => ({ ...tool, execution: { taskSupport: 'forbidden' as const } })),
            ...(next < listed.length ? { nextCursor: encodeCursor(next) } : {})
        };
    });

    return server;
}

interface SessionTools {
    listed: SessionTool[];
    /** Every integration tool, searchable ones included, so being listed and being callable stay separate. */
    callable: Map<string, { integrationId: string; name: string; description: string }>;
}

/** Names are claimed in one pass so no tool can take a name an earlier one answers to, and the stable order keeps an offset cursor valid. */
export function buildSessionTools(session: AgentSession): SessionTools {
    const taken = new Set<string>();

    const listed = META_TOOLS.filter((tool) => tool.isEnabled(session.metaTools)).map(
        (tool): SessionTool => ({
            name: claimToolName(tool.name, taken),
            description: tool.description,
            inputSchema: toJsonSchema202012(tool.inputSchema, 'input') ?? emptyObjectJsonSchema,
            ...(tool.outputSchema ? { outputSchema: toJsonSchema202012(tool.outputSchema, 'output') } : {}),
            ...(tool.annotations ? { annotations: tool.annotations } : {})
        })
    );

    const integrations = Object.entries(session.compiledToolset).sort(([a], [b]) => a.localeCompare(b));
    const callable: SessionTools['callable'] = new Map();

    for (const [integrationId, integration] of integrations) {
        for (const tool of integration.pinned) {
            const name = claimToolName(qualifiedToolName(integrationId, tool.name), taken);
            callable.set(name, { integrationId, name: tool.name, description: tool.description });
            listed.push({
                name,
                description: tool.description,
                inputSchema: PINNED_TOOL_INPUT_SCHEMA,
                _meta: { [INTEGRATION_META_KEY]: integrationId, [TOOL_META_KEY]: tool.name }
            });
        }
    }

    for (const [integrationId, integration] of integrations) {
        for (const tool of integration.searchable) {
            const name = claimToolName(qualifiedToolName(integrationId, tool.name), taken);
            callable.set(name, { integrationId, name: tool.name, description: tool.description });
        }
    }

    return { listed, callable };
}

export function listSessionTools(session: AgentSession): SessionTool[] {
    return buildSessionTools(session).listed;
}

function qualifiedToolName(integrationId: string, toolName: string): string {
    return `${sanitizeNamePart(integrationId)}${TOOL_NAME_SEPARATOR}${sanitizeNamePart(toolName)}`;
}

function sanitizeNamePart(part: string): string {
    return part.replace(UNSAFE_NAME_CHARACTERS, '_').slice(0, MAX_NAME_PART_LENGTH);
}

/**
 * Sanitising and clipping can map two tools onto one name, which would let one registration
 * shadow another. First claim wins, later ones are numbered.
 */
function claimToolName(name: string, taken: Set<string>): string {
    if (!taken.has(name)) {
        taken.add(name);
        return name;
    }

    for (let suffix = 2; ; suffix++) {
        const room = MAX_TOOL_NAME_LENGTH - String(suffix).length - 1;
        const candidate = `${name.slice(0, room)}_${suffix}`;
        if (!taken.has(candidate)) {
            taken.add(candidate);
            return candidate;
        }
    }
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
        throw new McpError(ErrorCode.InvalidParams, 'Invalid cursor');
    }

    return parseInt(decoded, 10);
}
