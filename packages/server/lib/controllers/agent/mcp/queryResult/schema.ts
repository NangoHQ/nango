import * as z from 'zod/v4';

import { goalSchema, intentSchema } from '../purposeSchema.js';

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
