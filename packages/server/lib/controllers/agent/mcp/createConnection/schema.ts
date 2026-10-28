import * as z from 'zod/v4';

import { providerConfigKeySchema } from '../../../../helpers/validation.js';

export const createConnectionInputSchema = z
    .object({
        integration: providerConfigKeySchema.min(1).describe('The integration to connect, named exactly as a tool or a search result gives it.'),
        reconnect: z
            .boolean()
            .optional()
            .describe(
                'Set to true to have the user authorise an integration that is already connected again, for example when it is missing a permission, or its credentials expired or ran out of refresh attempts. It keeps the same connection.'
            )
    })
    .strict();

export const createConnectionOutputSchema = z
    .object({
        guidance: z.string(),
        integration: z.string(),
        provider: z.string(),
        connect_url: z.url().describe('Give this to the user. It is theirs to open, not yours to fetch.'),
        expires_at: z.iso.datetime().describe('The link stops working after this, and calling again issues a new one.')
    })
    .strict();

export type CreateConnectionOutput = z.output<typeof createConnectionOutputSchema>;
