import * as z from 'zod/v4';

const proxyResponseHeaderSchema = z.union([z.string(), z.array(z.string())]);

export const proxyRequestOutputSchema = z
    .object({
        status: z.number().int(),
        headers: z.record(z.string(), proxyResponseHeaderSchema),
        body: z.json()
    })
    .strict();

export type ProxyRequestOutput = z.infer<typeof proxyRequestOutputSchema>;
