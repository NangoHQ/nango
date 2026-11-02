import * as z from 'zod/v4';

import { connectionIdSchema, scriptNameSchema } from '../../../helpers/validation.js';
import { functionIntegrationIdSchema } from '../../functions/validation.js';

export const callToolArgumentsSchema = z
    .object({
        integration_id: functionIntegrationIdSchema,
        connection_id: connectionIdSchema,
        name: scriptNameSchema,
        input: z
            .json()
            .meta({ type: ['object', 'array', 'string', 'number', 'boolean', 'null'] })
            .optional()
    })
    .strict();

export const callToolOutputSchema = z.object({ data: z.json() }).strict();

export type CallToolOutput = z.infer<typeof callToolOutputSchema>;
