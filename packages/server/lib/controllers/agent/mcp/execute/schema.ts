import * as z from 'zod/v4';

import { providerConfigKeySchema, scriptNameSchema } from '../../../../helpers/validation.js';

export const executeInputSchema = z
    .object({
        integration: providerConfigKeySchema.min(1).describe('The integration id the tool belongs to.'),
        tool: scriptNameSchema.min(1).describe('The tool name, unqualified.'),
        input: z.looseObject({}).optional().describe('The arguments to pass to the tool.')
    })
    .strict();
