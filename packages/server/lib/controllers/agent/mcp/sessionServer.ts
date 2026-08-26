import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod/v4';

import { emptyObjectJsonSchema, toJsonSchema202012 } from '../../mcp/utils.js';
import { executeSessionTool, executeTool } from './execute/execute.js';
import { callAgentSessionTool } from './sessionTool.js';
import { toolSearchTool } from './toolSearch/search.js';

import type { AgentSessionMcpContext, AgentSessionMcpTool } from './sessionTool.js';
import type { AnySchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { AgentSession, AgentSessionMetaTools } from '@nangohq/types';

export const TOOLS_PAGE_SIZE = 50;

/**
 * A tool name is unique across the whole server, but an action name is only unique within its
 * integration, so the listed name is qualified. `_meta` carries both halves back, and it, not
 * the name, is what a caller reads to know what a tool points at.
 */
export const TOOL_NAME_SEPARATOR = '__';

export const INTEGRATION_META_KEY = 'nango/integration';
export const TOOL_META_KEY = 'nango/tool';

const MAX_TOOL_NAME_LENGTH = 64;
const MAX_NAME_PART_LENGTH = 30;
const UNSAFE_NAME_CHARACTERS = /[^a-zA-Z0-9_-]/g;

const JSON_SCHEMA_2020_12 = 'https://json-schema.org/draft/2020-12/schema';

type SessionTool = Tool & { description: string };

const META_TOOLS: AgentSessionMcpTool[] = [toolSearchTool, executeTool];

/**
 * The compiled toolset stores a name and a description per tool, not an argument schema, so a
 * pinned tool is listed as accepting a free-form object. Argument names reach the agent through
 * nango_tool_search, which reads them from the function catalog.
 */
const PINNED_TOOL_INPUT_SCHEMA: Tool['inputSchema'] = {
    $schema: JSON_SCHEMA_2020_12,
    type: 'object',
    properties: {},
    additionalProperties: true
};

/**
 * registerTool only hands the callback the tool's arguments when the registration declares an input
 * schema; without one the SDK passes its own request extra instead. The registration therefore takes
 * a permissive schema and each tool validates its own arguments, which is also what keeps the
 * rejection message ours rather than the SDK's.
 */
const REGISTRATION_INPUT_SCHEMA = z.looseObject({}) as unknown as AnySchema;

export function createAgentSessionMcpServer(context: AgentSessionMcpContext): McpServer {
    const { session, account } = context;

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

    const tools = listSessionTools(session);
    const listed = new Set(tools.map((tool) => tool.name));
    const metaToolsByName = new Map(META_TOOLS.map((tool) => [tool.name, tool]));

    for (const tool of [...tools, ...disabledMetaTools(session.metaTools)]) {
        const registered = server.registerTool(tool.name, { description: tool.description, inputSchema: REGISTRATION_INPUT_SCHEMA }, async (args: unknown) =>
            callAgentSessionTool({
                name: tool.name,
                accountId: account.id,
                run: async () => await callSessionTool({ tool, metaToolsByName, args, context })
            })
        );

        if (!listed.has(tool.name)) {
            // Disabled tools are omitted from tools/list and rejected by the SDK if called.
            registered.disable();
        }
    }

    server.server.setRequestHandler(ListToolsRequestSchema, (request) => {
        const offset = decodeCursor(request.params?.cursor);
        const page = tools.slice(offset, offset + TOOLS_PAGE_SIZE);
        const next = offset + page.length;

        return {
            tools: page.map((tool) => ({ ...tool, execution: { taskSupport: 'forbidden' as const } })),
            ...(next < tools.length ? { nextCursor: encodeCursor(next) } : {})
        };
    });

    return server;
}

/**
 * A pinned tool is listed under its own name, so it is called directly rather than through
 * nango_execute and `_meta` is what says which tool it is. Everything else is a meta tool, whose
 * listed name is always its own because meta tools claim their names first.
 */
async function callSessionTool({
    tool,
    metaToolsByName,
    args,
    context
}: {
    tool: { name: string; _meta?: Tool['_meta'] };
    metaToolsByName: Map<string, AgentSessionMcpTool>;
    args: unknown;
    context: AgentSessionMcpContext;
}) {
    const integrationId = tool._meta?.[INTEGRATION_META_KEY];
    const toolName = tool._meta?.[TOOL_META_KEY];

    if (typeof integrationId === 'string' && typeof toolName === 'string') {
        return await executeSessionTool({ integrationId, toolName, input: args, context });
    }

    const metaTool = metaToolsByName.get(tool.name)!;
    return await metaTool.handler(args, context);
}

/**
 * The tools the session puts in front of the agent: the meta tools it was created with, then
 * every pinned tool. Searchable tools are deliberately absent, they are reached through
 * nango_tool_search so that a large toolset does not fill the context window.
 *
 * The order is stable for the life of the session, which is what makes an offset cursor safe.
 * Meta tools are named first so that no pinned tool can take a meta tool's name.
 */
export function listSessionTools(session: AgentSession): SessionTool[] {
    const taken = new Set<string>();

    const metaTools = META_TOOLS.filter((tool) => tool.isEnabled(session.metaTools)).map(
        (tool): SessionTool => ({
            name: claimToolName(tool.name, taken),
            description: tool.description,
            inputSchema: toJsonSchema202012(tool.inputSchema, 'input') ?? emptyObjectJsonSchema,
            ...(tool.annotations ? { annotations: tool.annotations } : {})
        })
    );

    const pinnedTools = Object.entries(session.compiledToolset)
        .sort(([a], [b]) => a.localeCompare(b))
        .flatMap(([integrationId, integration]) =>
            integration.pinned.map(
                (tool): SessionTool => ({
                    name: claimToolName(qualifiedToolName(integrationId, tool.name), taken),
                    description: tool.description,
                    inputSchema: PINNED_TOOL_INPUT_SCHEMA,
                    _meta: { [INTEGRATION_META_KEY]: integrationId, [TOOL_META_KEY]: tool.name }
                })
            )
        );

    return [...metaTools, ...pinnedTools];
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

function disabledMetaTools(metaTools: AgentSessionMetaTools): { name: string; description: string }[] {
    return META_TOOLS.filter((tool) => !tool.isEnabled(metaTools)).map((tool) => ({ name: tool.name, description: tool.description }));
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
