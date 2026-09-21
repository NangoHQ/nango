import * as z from 'zod/v4';

export const createConnectionInputSchema = z
    .object({
        integration: z.string().trim().min(1).max(255).describe('The integration to connect, named exactly as a tool or a search result gives it.')
    })
    .strict();

export const createConnectionOutputSchema = z
    .object({
        guidance: z.string(),
        integration: z.string(),
        provider: z.string(),
        connect_url: z.string().describe('Give this to the user. It is theirs to open, not yours to fetch.'),
        expires_at: z.string().describe('ISO 8601. The link stops working after this, and calling again issues a new one.')
    })
    .strict();
