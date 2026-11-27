import * as z from 'zod/v4';

import { providerConfigKeySchema } from '../../../helpers/validation.js';

import type { AgentSessionToolDefinition } from '../types.js';

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

export const createConnectionToolDefinition = {
    name: 'nango_create_connection',
    description:
        "Start the connect flow for one of this session's integrations that has no connection yet. Returns a link for the user to open and authorise, after which the integration's tools work for the rest of the session. The user has to open it, you cannot complete this yourself. Pass reconnect to have the user authorise an integration that is already connected again, for example when it is missing a permission, or its credentials expired or ran out of refresh attempts, and it keeps the same connection.",
    inputSchema: createConnectionInputSchema,
    outputSchema: createConnectionOutputSchema,
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
    },
    isEnabled: (metaTools) => metaTools.nangoCreateConnection.enabled
} satisfies AgentSessionToolDefinition;
