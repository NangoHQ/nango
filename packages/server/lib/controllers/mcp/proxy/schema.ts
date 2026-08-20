import * as z from 'zod/v4';

import { connectionIdSchema, providerConfigKeySchema } from '../../../helpers/validation.js';

const queryValueSchema = z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]);
const proxyResponseHeaderSchema = z.union([z.string(), z.array(z.string())]);

export const proxyRequestInputSchema = z
    .object({
        method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
        path: z
            .string()
            .min(1)
            .max(8192)
            .startsWith('/')
            .refine((path) => !path.includes('#'), { message: 'URL fragments are not supported in proxy paths.' }),
        integration_id: providerConfigKeySchema.min(1),
        connection_id: connectionIdSchema.min(1),
        query_params: z.record(z.string().min(1).max(255), queryValueSchema).optional(),
        headers: z.record(z.string().min(1).max(255), z.string().max(8192)).optional(),
        body: z.json().optional(),
        base_url_override: z.url().or(z.literal('')).optional(),
        retries: z.number().int().min(0).max(5).optional(),
        decompress: z.boolean().optional(),
        retry_on: z.array(z.number().int().min(100).max(599)).optional(),
        forward_headers_on_redirect: z.boolean().optional()
    })
    .strict();

export const proxyRequestOutputSchema = z
    .object({
        status: z.number().int(),
        headers: z.record(z.string(), proxyResponseHeaderSchema),
        body: z.json()
    })
    .strict();

export type ProxyRequestOutput = z.infer<typeof proxyRequestOutputSchema>;
