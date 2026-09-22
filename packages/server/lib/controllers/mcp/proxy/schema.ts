import * as z from 'zod/v4';

import { connectionIdSchema, providerConfigKeySchema } from '../../../helpers/validation.js';
import { proxyHeadersSchema, proxyMethodSchema, proxyPathSchema, proxyQueryParamsSchema } from '../../../services/mcpProxySchema.js';

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
