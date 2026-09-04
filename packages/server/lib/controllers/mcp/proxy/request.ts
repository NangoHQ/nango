import { executeMcpProxyRequest, MAX_MCP_PROXY_RESPONSE_SIZE_LABEL, mcpProxyResponseSchema } from '../../../services/mcpProxy.service.js';
import { defineManagementMcpTool } from '../managementTool.js';
import { proxyRequestInputSchema } from './schema.js';

import type { McpProxyResponse } from '../../../services/mcpProxy.service.js';
import type { ManagementMcpTool } from '../managementTool.js';

export const proxyRequestTool: ManagementMcpTool<McpProxyResponse> = defineManagementMcpTool<typeof proxyRequestInputSchema, McpProxyResponse>({
    name: 'proxy_request',
    description: `Make an authenticated HTTP request to a provider API through the Nango proxy. Returns JSON or UTF-8 text responses up to ${MAX_MCP_PROXY_RESPONSE_SIZE_LABEL}; unsafe JSON numbers are strings. Use the HTTP proxy for binary or larger responses.`,
    inputSchema: proxyRequestInputSchema,
    outputSchema: mcpProxyResponseSchema,
    requiredScopes: { every: ['environment:proxy'] },
    audit: { kind: 'no-audit', reason: 'non-auditable' },
    annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true
    },
    async handler({ args, account, environment, plan }) {
        return await executeMcpProxyRequest({
            account,
            environment,
            plan,
            integrationId: args.integration_id,
            connectionId: args.connection_id,
            method: args.method,
            path: args.path,
            queryParams: args.query_params,
            headers: args.headers,
            body: args.body,
            baseUrlOverride: args.base_url_override,
            retries: args.retries,
            decompress: args.decompress,
            retryOn: args.retry_on,
            forwardHeadersOnRedirect: args.forward_headers_on_redirect
        });
    }
});
