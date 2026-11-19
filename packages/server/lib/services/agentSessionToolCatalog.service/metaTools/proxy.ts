import * as z from 'zod/v4';

import { providerConfigKeySchema } from '../../../helpers/validation.js';
import { MAX_MCP_PROXY_RESPONSE_SIZE_LABEL } from '../../mcpProxyResponse.js';
import { proxyHeadersSchema, proxyMethodSchema, proxyPathSchema, proxyQueryParamsSchema, proxyRequestOutputSchema } from '../../mcpProxySchema.js';
import { goalSchema, proxyIntentSchema } from '../purposeSchema.js';

import type { AgentSessionToolDefinition } from '../types.js';

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
            .describe(
                'Extra request headers. Nango authenticates the request from the session connection, so credential headers are rejected rather than forwarded.'
            ),
        body: z.json().optional().describe("The request body. Sent as JSON unless a 'content-type' header says otherwise."),
        goal: goalSchema,
        intent: proxyIntentSchema
    })
    .strict();

export const proxyToolDefinition = {
    name: 'nango_proxy',
    description: `Make an authenticated HTTP request to a provider API, on the connection this session resolved for the integration. The escape hatch for when no tool covers what you need, so search with nango_tool_search first and use this only if nothing fits. Returns JSON or UTF-8 text responses up to ${MAX_MCP_PROXY_RESPONSE_SIZE_LABEL}.`,
    inputSchema: proxyInputSchema,
    outputSchema: proxyRequestOutputSchema,
    annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true
    },
    isEnabled: (metaTools) => metaTools.nangoProxy
} satisfies AgentSessionToolDefinition;
