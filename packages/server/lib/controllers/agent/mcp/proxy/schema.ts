import * as z from 'zod/v4';

import { providerConfigKeySchema } from '../../../../helpers/validation.js';
import { proxyHeadersSchema, proxyMethodSchema, proxyPathSchema, proxyQueryParamsSchema } from '../../../../services/mcpProxySchema.js';

/**
 * Caller headers are merged over the credentials the proxy derives from the connection, so setting
 * one of these would let the agent authenticate as something other than the session's connection,
 * or reshape the hop itself. Only this tool rejects them: proxy_request is reached with an API key
 * that already holds the whole environment, so there overriding a header grants nothing new.
 */
const REJECTED_HEADERS = new Set([
    'authorization',
    'proxy-authorization',
    'connection',
    'content-length',
    'host',
    'keep-alive',
    'proxy-authenticate',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade'
]);

function rejectedHeadersIn(headers: Record<string, string>): string[] {
    return Object.keys(headers).filter((name) => REJECTED_HEADERS.has(name.toLowerCase()));
}

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
            .refine((headers) => rejectedHeadersIn(headers).length === 0, {
                error: (issue) =>
                    `Nango sets these headers itself, so they cannot be passed: ${rejectedHeadersIn(issue.input as Record<string, string>).join(', ')}. The request is authenticated with the session's connection.`
            })
            .optional()
            .describe('Extra request headers. Nango authenticates the request, so authentication and hop-by-hop headers are rejected rather than forwarded.'),
        body: z.json().optional().describe("The request body. Sent as JSON unless a 'content-type' header says otherwise.")
    })
    .strict();
