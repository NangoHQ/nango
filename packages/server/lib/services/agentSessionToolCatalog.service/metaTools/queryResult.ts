import * as z from 'zod/v4';

import { goalSchema, intentSchema } from '../purposeSchema.js';

import type { AgentSessionToolDefinition } from '../types.js';

export const queryResultInputSchema = z
    .object({
        result_id: z.string().min(1).max(1024).describe('The result_id a tool returned in place of a result too large to return in full.'),
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
        'Run JavaScript over a tool result that was too large to return in full, and get back only what the code returns. Pass the result_id from that tool result. Use its shape and sample to write the code. An output too large to return in full comes back as a new result_id.',
    inputSchema: queryResultInputSchema,
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
    },
    isEnabled: (metaTools) => metaTools.nangoQueryResult === true
} satisfies AgentSessionToolDefinition;
