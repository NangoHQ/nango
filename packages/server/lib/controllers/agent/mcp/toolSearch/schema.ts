import * as z from 'zod/v4';

export const toolSearchInputSchema = z
    .object({
        query: z.string().trim().min(1).max(255).describe('What the tool should do, in plain language. Describe the operation rather than naming a product.')
    })
    .strict();
