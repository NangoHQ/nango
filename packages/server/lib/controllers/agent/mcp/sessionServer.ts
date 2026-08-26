import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';

import { mcpToolError } from '../../mcp/utils.js';

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

interface MetaToolDefinition {
    readonly name: string;
    readonly description: string;
    readonly inputSchema: Tool['inputSchema'];
    readonly isEnabled: (metaTools: AgentSessionMetaTools) => boolean;
}

const META_TOOLS: MetaToolDefinition[] = [
    {
        name: 'nango_tool_search',
        description:
            'Search the tools this session can reach that are not already listed. Returns tool names to pass to nango_execute, so start here when no listed tool fits the task.',
        inputSchema: {
            $schema: JSON_SCHEMA_2020_12,
            type: 'object',
            properties: {
                query: { type: 'string', description: 'What the tool should do, in plain language.' },
                integration: { type: 'string', description: 'Restrict the search to one integration id.' }
            },
            required: ['query']
        },
        isEnabled: (metaTools) => metaTools.nangoToolSearch
    },
    {
        name: 'nango_execute',
        description: 'Run a tool on one of the session integrations, on the connection the session resolved for it.',
        inputSchema: {
            $schema: JSON_SCHEMA_2020_12,
            type: 'object',
            properties: {
                integration: { type: 'string', description: 'The integration id the tool belongs to.' },
                tool: { type: 'string', description: 'The tool name, unqualified.' },
                input: { type: 'object', description: 'The arguments to pass to the tool.', additionalProperties: true }
            },
            required: ['integration', 'tool']
        },
        isEnabled: (metaTools) => metaTools.nangoExecute
    }
];

/**
 * The compiled toolset stores a name and a description per tool, not an argument schema, so a
 * pinned tool is listed as accepting a free-form object.
 * TODO(NAN-6601): snapshot the action input schema at compile time and list it here.
 */
const PINNED_TOOL_INPUT_SCHEMA: Tool['inputSchema'] = {
    $schema: JSON_SCHEMA_2020_12,
    type: 'object',
    properties: {},
    additionalProperties: true
};

export function createAgentSessionMcpServer(session: AgentSession): McpServer {
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

    // Registered so a call reaches a handler rather than the SDK's unknown-tool error. Execution
    // lands in NAN-6601, NAN-6602 and NAN-6603.
    for (const tool of [...tools, ...disabledMetaTools(session.metaTools)]) {
        const registered = server.registerTool(tool.name, { description: tool.description }, () =>
            mcpToolError(`Tool '${tool.name}' cannot be called yet on an agent session.`)
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
            inputSchema: tool.inputSchema
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
