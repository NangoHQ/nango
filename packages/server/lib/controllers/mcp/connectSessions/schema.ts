import * as z from 'zod/v4';

export const createConnectSessionOutputSchema = z
    .object({
        token: z.string().min(1),
        connect_link: z.url(),
        expires_at: z.iso.datetime()
    })
    .strict();

export type CreateConnectSessionOutput = z.infer<typeof createConnectSessionOutputSchema>;
