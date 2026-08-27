import * as z from 'zod/v4';

import { providerConfigKeySchema, scriptNameSchema } from '../../../../helpers/validation.js';

export const executeInputSchema = z
    .object({
        integration: providerConfigKeySchema.min(1).describe('The integration id the tool belongs to.'),
        tool: scriptNameSchema.min(1).describe('The tool name, unqualified.'),
        // A tool's input is validated against its own deployed schema, which can have any JSON root.
        input: z.json().optional().describe('The input to pass to the tool.')
    })
    .strict();
