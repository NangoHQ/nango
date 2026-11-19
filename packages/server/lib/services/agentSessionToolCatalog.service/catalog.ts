import { report } from '@nangohq/utils';

import { toJsonSchema202012 } from '../../utils/toolSchema.js';
import { findActionInputs, withModelDefinitionsHoisted } from '../agentSessionToolSearch.service.js';
import { clientToolTags, TAGS_META_KEY } from '../agentSessionToolTags.js';
import { directCallInputSchema } from './directCallSchema.js';
import { AGENT_SESSION_META_TOOL_DEFINITIONS } from './metaTools/index.js';
import { MAX_TOOL_NAME_LENGTH } from './types.js';

import type { AgentSessionCallableTool } from './types.js';
import type { Tool, ToolAnnotations } from '@modelcontextprotocol/server';
import type { AgentSession, AgentSessionCompiledTool, AgentSessionCompiledToolset, AgentSessionToolInput } from '@nangohq/types';

/**
 * A tool name is unique across the whole server, but an action name is only unique within its
 * integration, so the listed name is qualified. `_meta` carries both halves back, and it, not
 * the name, is what a caller reads to know what a tool points at.
 */
export const TOOL_NAME_SEPARATOR = '__';

export const INTEGRATION_META_KEY = 'nango/integration';
export const TOOL_META_KEY = 'nango/tool';

const UNSAFE_NAME_CHARACTERS = /[^a-zA-Z0-9_-]/g;

type SessionTool = Tool & { description: string };

/**
 * The compiled toolset stores no argument schema for a deployed action, so tools/list reads the one it
 * was deployed with. Any input is accepted when that schema can't be read.
 */
const PINNED_TOOL_INPUT_SCHEMA = directCallInputSchema(undefined);

export interface SessionTools {
    listed: SessionTool[];
    /** Every integration tool, searchable ones included, so being listed and being callable stay separate. */
    callable: Map<string, AgentSessionCallableTool>;
    /** Listed deployed actions by name, whose input schema is read when they are listed. */
    actions: Map<string, { integrationId: string; name: string }>;
}

/** Names are claimed in one pass so no tool can take a name an earlier one answers to, and the stable order keeps an offset cursor valid. */
export function buildSessionTools(session: AgentSession): SessionTools {
    // Stored names were picked around every other name, so reserving them first leaves the rest unchanged.
    const taken = new Set<string>(storedSlugs(session.compiledToolset));

    const listed = AGENT_SESSION_META_TOOL_DEFINITIONS.filter((tool) => tool.isEnabled(session.metaTools)).map(
        (tool): SessionTool => ({
            name: claimToolName(tool.name, taken),
            description: tool.description,
            inputSchema: toJsonSchema202012(tool.inputSchema, 'input'),
            ...(tool.outputSchema ? { outputSchema: toJsonSchema202012(tool.outputSchema, 'output') } : {}),
            ...(tool.annotations ? { annotations: tool.annotations } : {})
        })
    );

    const integrations = Object.entries(session.compiledToolset).sort(([a], [b]) => a.localeCompare(b));
    const callable: SessionTools['callable'] = new Map();
    const actions: SessionTools['actions'] = new Map();

    for (const [integrationId, integration] of integrations) {
        for (const tool of integration.pinned) {
            const name = tool.slug ?? claimToolName(qualifiedToolName(integrationId, tool.name), taken);
            callable.set(name, { integrationId, name: tool.name, description: tool.description, pinned: true });
            if (!tool.mcp) {
                actions.set(name, { integrationId, name: tool.name });
            }
            const tags = clientToolTags(tool.tags);
            listed.push({
                name,
                description: tool.description,
                inputSchema: tool.mcp ? directCallInputSchema(tool.mcp.inputSchema) : PINNED_TOOL_INPUT_SCHEMA,
                ...(tool.mcp?.annotations ? { annotations: tool.mcp.annotations as ToolAnnotations } : {}),
                _meta: { [INTEGRATION_META_KEY]: integrationId, [TOOL_META_KEY]: tool.name, ...(tags ? { [TAGS_META_KEY]: tags } : {}) }
            });
        }
    }

    for (const [integrationId, integration] of integrations) {
        for (const tool of integration.searchable) {
            const name = tool.slug ?? claimToolName(qualifiedToolName(integrationId, tool.name), taken);
            callable.set(name, { integrationId, name: tool.name, description: tool.description, pinned: false });
        }
    }

    return { listed, callable, actions };
}

export function listSessionTools(session: AgentSession): SessionTool[] {
    return buildSessionTools(session).listed;
}

/** A lookup that fails leaves the page with the free-form schema it was built with, so tools/list still answers. */
export async function withActionInputSchemas({
    page,
    actions,
    environmentId
}: {
    page: SessionTool[];
    actions: SessionTools['actions'];
    environmentId: number;
}): Promise<SessionTool[]> {
    const onPage = page.flatMap((tool) => actions.get(tool.name) ?? []);
    if (onPage.length === 0) {
        return page;
    }

    try {
        const inputs = await findActionInputs({ environmentId, actions: onPage });

        return page.map((tool) => {
            const action = actions.get(tool.name);
            const input = action ? inputs.get(action.integrationId)?.get(action.name) : undefined;
            return input ? { ...tool, inputSchema: actionInputSchemaOf(input) } : tool;
        });
    } catch (err) {
        report(err);
        return page;
    }
}

export function actionInputSchemaOf(input: AgentSessionToolInput): Tool['inputSchema'] {
    if (input.kind === 'none') {
        return directCallInputSchema('none');
    }

    return input.kind === 'schema' ? directCallInputSchema(withModelDefinitionsHoisted(input.schema) as Record<string, unknown>) : PINNED_TOOL_INPUT_SCHEMA;
}

/**
 * Names the tools an integration gained after the session was created, around every name the session
 * already answers to, so a name an agent was already given keeps pointing at the same tool.
 */
export function withAddedToolSlugs({ session, added }: { session: AgentSession; added: AgentSessionCompiledToolset }): AgentSessionCompiledToolset {
    const { listed, callable } = buildSessionTools(session);
    const taken = new Set([...listed.map((tool) => tool.name), ...callable.keys()]);

    return Object.fromEntries(
        Object.entries(added)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([integrationId, integration]) => {
                const existing = session.compiledToolset[integrationId];
                const named = new Set([...(existing?.pinned ?? []), ...(existing?.searchable ?? [])].map((tool) => tool.name));
                const withSlug = (tool: AgentSessionCompiledTool): AgentSessionCompiledTool =>
                    named.has(tool.name) || tool.slug ? tool : { ...tool, slug: claimToolName(qualifiedToolName(integrationId, tool.name), taken) };

                return [integrationId, { ...integration, pinned: integration.pinned.map(withSlug), searchable: integration.searchable.map(withSlug) }];
            })
    );
}

function storedSlugs(toolset: AgentSessionCompiledToolset): string[] {
    return Object.values(toolset).flatMap((integration) =>
        [...integration.pinned, ...integration.searchable].flatMap((tool) => (tool.slug ? [tool.slug] : []))
    );
}

/**
 * Clipping only the tail would let a long integration id wipe out the tool name, so a short
 * part leaves its unused room to the other and two long parts each keep about half.
 */
function qualifiedToolName(integrationId: string, toolName: string): string {
    const budget = MAX_TOOL_NAME_LENGTH - TOOL_NAME_SEPARATOR.length;
    const tool = sanitizeNamePart(toolName);
    const integration = sanitizeNamePart(integrationId).slice(0, Math.max(Math.ceil(budget / 2), budget - tool.length));
    return `${integration}${TOOL_NAME_SEPARATOR}${tool.slice(0, budget - integration.length)}`;
}

function sanitizeNamePart(part: string): string {
    return part.replace(UNSAFE_NAME_CHARACTERS, '_');
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
