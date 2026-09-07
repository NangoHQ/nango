import * as z from 'zod/v4';

import { providerConfigKeySchema } from '../../../../helpers/validation.js';
import { proxyHeadersSchema, proxyMethodSchema, proxyPathSchema, proxyQueryParamsSchema } from '../../../../services/mcpProxySchema.js';

/**
 * The connection is the session's, so the agent names an integration and never a connection. No
 * base URL override or retry controls either: an escape hatch only needs to reach the API.
 */
export const proxyInputSchema = z
    .object({
        integration: providerConfigKeySchema.min(1).describe("One of this session's integrations, as named by nango_tool_search or a tool's _meta."),
        method: proxyMethodSchema,
        path: proxyPathSchema.describe("Path on the provider API, starting with '/'. Relative to the provider's base URL."),
        query_params: proxyQueryParamsSchema
            .optional()
            .describe('Query parameters to append to the path. An array value is repeated as one parameter per item.'),
        headers: proxyHeadersSchema
            .optional()
            .describe('Extra request headers. Nango authenticates the request, so authentication and hop-by-hop headers are rejected rather than forwarded.'),
        body: z.json().optional().describe("The request body. Sent as JSON unless a 'content-type' header says otherwise.")
    })
    .strict();
