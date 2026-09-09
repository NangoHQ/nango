import * as z from 'zod/v4';

import { connectionIdSchema, providerConfigKeySchema } from '../../../helpers/validation.js';

const syncsSchema = z
    .array(z.union([z.string(), z.object({ name: z.string(), variant: z.string() }).strict()]))
    .min(0)
    .max(256);

export const setSyncsStateArgumentsSchema = z
    .object({
        syncs: syncsSchema,
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

export const triggerSyncsArgumentsSchema = z
    .object({
        syncs: syncsSchema,
        integration_id: providerConfigKeySchema,
        connection_id: connectionIdSchema.optional(),
        reset: z.boolean().optional().default(false).describe('Run a full sync instead of an incremental sync.'),
        empty_cache: z
            .boolean()
            .optional()
            .default(false)
            .describe('Delete existing synced records before a full sync. Only applies when reset is true; otherwise ignored.')
    })
    .strict();

export const triggerSyncsOutputSchema = z
    .object({
        success: z.literal(true)
    })
    .strict();

export type TriggerSyncsOutput = z.infer<typeof triggerSyncsOutputSchema>;
