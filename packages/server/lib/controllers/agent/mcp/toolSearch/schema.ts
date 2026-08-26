import * as z from 'zod/v4';

import { providerConfigKeySchema } from '../../../../helpers/validation.js';

export const toolSearchInputSchema = z
    .object({
        query: z.string().trim().min(1).max(255).describe('What the tool should do, in plain language.'),
        integration: providerConfigKeySchema.min(1).optional().describe('Restrict the search to one integration id.')
    })
    .strict();
