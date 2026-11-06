import * as z from 'zod/v4';

import { connectionIdSchema, providerConfigKeySchema, syncNameSchema } from '../../../helpers/validation.js';

export const triggerActionArgumentsSchema = z
    .object({
        action_name: syncNameSchema,
        // Keep every JSON value valid while giving the MCP parameter an explicit type.
        input: z
            .json()
            .meta({ type: ['object', 'array', 'string', 'number', 'boolean', 'null'] })
            .optional(),
        integration_id: providerConfigKeySchema,
        connection_id: connectionIdSchema
    })
    .strict();

// Action functions can return any JSON value. MCP structured content requires a top-level
// object, so keep the action response in a stable data envelope.
export const triggerActionOutputSchema = z.object({ data: z.json() }).strict();

export type TriggerActionOutput = z.infer<typeof triggerActionOutputSchema>;
