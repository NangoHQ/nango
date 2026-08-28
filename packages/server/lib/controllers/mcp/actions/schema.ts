import * as z from 'zod/v4';

import { connectionIdSchema, providerConfigKeySchema, syncNameSchema } from '../../../helpers/validation.js';

export const triggerActionArgumentsSchema = z
    .object({
        action_name: syncNameSchema,
        input: z.json(),
        integration_id: providerConfigKeySchema,
        connection_id: connectionIdSchema
    })
    .strict();

// Action functions return user-defined JSON objects. MCP structured content requires the
// top-level value to be an object.
export const triggerActionOutputSchema = z.looseObject({});

export type TriggerActionOutput = z.infer<typeof triggerActionOutputSchema>;
