import * as z from 'zod/v4';

import { Err } from '@nangohq/utils';

import { trackAgentSessionToolCall } from '../../../services/agentSessionAnalytics.service.js';
import { formatMcpArgumentsError, PublicMcpError } from '../../mcp/utils.js';
import { executeSessionTool } from './execute/execute.js';
import { goalSchema, intentSchema } from './purposeSchema.js';

import type { AgentSessionCallableTool, AgentSessionMcpContext } from './sessionTool.js';
import type { Tool } from '@modelcontextprotocol/server';
import type { Result } from '@nangohq/utils';

const JSON_SCHEMA_2020_12 = 'https://json-schema.org/draft/2020-12/schema';

/**
 * A directly called tool takes its input wrapped next to the goal and the intent, the same shape
 * nango_execute takes, so our fields never clash with one of the tool's own and any input root works.
 */
const directCallSchema = z
    .object({
        input: z.json().optional(),
        goal: goalSchema,
        intent: intentSchema
    })
    .strict();

const WRAPPED_KEYS = new Set(['input', 'goal', 'intent']);

const PURPOSE_PROPERTIES = z.toJSONSchema(z.object({ goal: goalSchema, intent: intentSchema }), { io: 'input' }).properties;

/**
 * What tools/list advertises for a tool, from the schema of its own input: `none` for a tool that
 * takes no input, `undefined` when that schema is unknown, so any input is accepted.
 */
export function directCallInputSchema(toolInput: Record<string, unknown> | 'none' | undefined): Tool['inputSchema'] {
    if (toolInput === 'none') {
        return wrapper({ properties: {}, required: [] });
    }

    if (toolInput === undefined) {
        return wrapper({ properties: { input: { description: 'The input to pass to the tool.' } }, required: [] });
    }

    // Definitions stay at the root so the tool schema's root-relative $refs still resolve once it is nested.
    const { $schema, $id: _id, $defs, definitions, ...input } = toolInput;
    return wrapper({
        $schema: typeof $schema === 'string' ? $schema : JSON_SCHEMA_2020_12,
        properties: { input },
        required: ['input'],
        ...($defs === undefined ? {} : { $defs }),
        ...(definitions === undefined ? {} : { definitions })
    });
}

/**
 * Sessions created before the wrapped shape was advertised still call tools with the bare input, so
 * both are accepted (NAN-8005). Only goal and intent together with nothing but an input count as
 * wrapped, which a tool's own input is very unlikely to look like.
 */
export async function executeDirectToolCall({
    name,
    tool,
    args,
    context
}: {
    name: string;
    tool: AgentSessionCallableTool;
    args: unknown;
    context: AgentSessionMcpContext;
}): Promise<Result<unknown>> {
    const target = { integrationId: tool.integrationId, toolName: tool.name, pinned: tool.pinned, context };

    if (!isWrapped(args)) {
        return await executeSessionTool({ ...target, input: args });
    }

    const parsed = directCallSchema.safeParse(args);
    if (!parsed.success) {
        trackAgentSessionToolCall({
            session: context.session,
            integrationId: tool.integrationId,
            toolName: tool.name,
            pinned: tool.pinned,
            errorCode: 'invalid_input'
        });
        return Err(
            new PublicMcpError(`${formatMcpArgumentsError(name, parsed.error)}. Correct the arguments and call it again.`, {
                code: 'invalid_input',
                integrationId: tool.integrationId
            })
        );
    }

    const { input, goal, intent } = parsed.data;
    return await executeSessionTool({ ...target, input, purpose: { goal, intent } });
}

function isWrapped(args: unknown): boolean {
    if (typeof args !== 'object' || args === null || Array.isArray(args)) {
        return false;
    }

    const keys = Object.keys(args);
    return keys.includes('goal') && keys.includes('intent') && keys.every((key) => WRAPPED_KEYS.has(key));
}

function wrapper({
    $schema = JSON_SCHEMA_2020_12,
    properties,
    required,
    ...rest
}: {
    $schema?: string;
    properties: Record<string, unknown>;
    required: string[];
    $defs?: unknown;
    definitions?: unknown;
}): Tool['inputSchema'] {
    return {
        $schema,
        type: 'object',
        properties: { ...properties, ...PURPOSE_PROPERTIES },
        required: [...required, 'goal', 'intent'],
        additionalProperties: false,
        ...rest
    } as Tool['inputSchema'];
}
