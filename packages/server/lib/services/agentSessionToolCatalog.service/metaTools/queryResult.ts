import * as z from 'zod/v4';

import { goalSchema, intentSchema } from '../purposeSchema.js';

import type { AgentSessionToolDefinition } from '../types.js';

export const queryResultInputSchema = z
    .object({
        result_id: z.string().min(1).max(1024).describe('The result_id a tool result came back with.'),
        code: z
            .string()
            .min(1)
            .describe(
                'The body of an async JavaScript function. The stored result is in `result`, and what the code returns is sent back to you. Do not declare a variable named `result`. The code has only the language built-ins: no network, no imports, no Nango SDK.'
            ),
        goal: goalSchema,
        intent: intentSchema
    })
    .strict();

export const queryResultToolDefinition = {
    name: 'nango_query_result',
    description:
        'Run JavaScript over a stored tool result, and get back only what the code returns. Pass the result_id from that tool result. Use it for a truncated result, writing the code from its shape and sample, or to filter, count or combine a result instead of reading through it. What the code returns comes back with a result_id of its own.',
    inputSchema: queryResultInputSchema,
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
    },
    isEnabled: (metaTools) => metaTools.nangoQueryResult === true
} satisfies AgentSessionToolDefinition;
