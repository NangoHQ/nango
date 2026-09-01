import * as z from 'zod/v4';

import { connectionIdSchema, providerConfigKeySchema } from '../../../helpers/validation.js';

export const setSyncsStateArgumentsSchema = z
    .object({
        syncs: z
            .array(z.union([z.string(), z.object({ name: z.string(), variant: z.string() }).strict()]))
            .min(0)
            .max(256),
        integration_id: providerConfigKeySchema,
        connection_id: connectionIdSchema.optional(),
        state: z.enum(['started', 'paused'])
    })
    .strict();

export const setSyncsStateOutputSchema = z
    .object({
        success: z.literal(true)
    })
    .strict();

export type SetSyncsStateOutput = z.infer<typeof setSyncsStateOutputSchema>;
