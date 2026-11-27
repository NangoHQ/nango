import * as z from 'zod/v4';

import { goalSchema, intentSchema } from '../purposeSchema.js';
import { MAX_TOOL_NAME_LENGTH } from '../types.js';

import type { AgentSessionToolDefinition } from '../types.js';

export const executeInputSchema = z
    .object({
        tool: z
            .string()
            .min(1)
            .max(MAX_TOOL_NAME_LENGTH)
            .regex(/^[a-zA-Z0-9_-]+$/)
            .describe('The tool name, as listed in tools/list or returned by nango_tool_search.'),
        // A tool's input is validated against its own deployed schema, which can have any JSON root.
        input: z.json().optional().describe('The input to pass to the tool.'),
        goal: goalSchema,
        intent: intentSchema
    })
    .strict();

export const executeToolDefinition = {
    name: 'nango_execute',
    description:
        "Run one of this session's tools, named as it is listed in tools/list or returned by nango_tool_search, on the connection the session resolved for it. Reaches tools that are not listed.",
    inputSchema: executeInputSchema,
    annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true
    },
    isEnabled: (metaTools) => metaTools.nangoExecute
} satisfies AgentSessionToolDefinition;
