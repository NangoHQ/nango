import * as z from 'zod/v4';

import { isRelativeProxyEndpoint } from '@nangohq/shared';

const queryValueSchema = z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]);
const proxyResponseHeaderSchema = z.union([z.string(), z.array(z.string())]);

export const proxyMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export const proxyPathSchema = z
    .string()
    .min(1)
    .max(8192)
    .startsWith('/')
    .refine(isRelativeProxyEndpoint, { message: 'Proxy endpoint must be a relative path without template expressions.' })
    .refine((path) => !path.includes('#'), { message: 'URL fragments are not supported in proxy paths.' });

export const proxyQueryParamsSchema = z.record(z.string().min(1).max(255), queryValueSchema);

export const proxyHeadersSchema = z.record(z.string().min(1).max(255), z.string().max(8192));

export const proxyRequestOutputSchema = z
    .object({
        status: z.number().int(),
        headers: z.record(z.string(), proxyResponseHeaderSchema),
        body: z.json()
    })
    .strict();

export type ProxyQueryParams = z.infer<typeof proxyQueryParamsSchema>;
export type ProxyRequestOutput = z.infer<typeof proxyRequestOutputSchema>;
