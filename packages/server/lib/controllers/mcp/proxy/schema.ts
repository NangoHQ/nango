import * as z from 'zod/v4';

import { connectionIdSchema, providerConfigKeySchema } from '../../../helpers/validation.js';

const queryValueSchema = z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]);
const proxyResponseHeaderSchema = z.union([z.string(), z.array(z.string())]);

export const proxyMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export const proxyPathSchema = z
    .string()
    .min(1)
    .max(8192)
    .startsWith('/')
    .refine((path) => !path.includes('#'), { message: 'URL fragments are not supported in proxy paths.' });

export const proxyQueryParamsSchema = z.record(z.string().min(1).max(255), queryValueSchema);

export const proxyHeadersSchema = z.record(z.string().min(1).max(255), z.string().max(8192));

export const proxyRequestInputSchema = z
    .object({
        method: proxyMethodSchema,
        path: proxyPathSchema,
        integration_id: providerConfigKeySchema.min(1),
        connection_id: connectionIdSchema.min(1),
        query_params: proxyQueryParamsSchema.optional(),
        headers: proxyHeadersSchema.optional(),
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

export type ProxyQueryParams = z.infer<typeof proxyQueryParamsSchema>;
export type ProxyRequestOutput = z.infer<typeof proxyRequestOutputSchema>;
