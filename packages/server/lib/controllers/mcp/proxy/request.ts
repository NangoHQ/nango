import { Err, Ok } from '@nangohq/utils';

import { executeMcpProxyRequest } from '../../../services/mcpProxy.service.js';
import { MAX_MCP_PROXY_RESPONSE_SIZE_LABEL } from '../../../services/mcpProxyResponse.js';
import { proxyRequestOutputSchema } from '../../../services/mcpProxySchema.js';
import { defineManagementMcpTool } from '../managementTool.js';
import { proxyRequestErrorToMcp } from './errors.js';
import { proxyRequestInputSchema } from './schema.js';

import type { ProxyRequestOutput } from '../../../services/mcpProxySchema.js';
import type { ManagementMcpTool } from '../managementTool.js';

export const proxyRequestTool: ManagementMcpTool<ProxyRequestOutput> = defineManagementMcpTool<typeof proxyRequestInputSchema, ProxyRequestOutput>({
    name: 'proxy_request',
    description: `Make an authenticated HTTP request to a provider API through the Nango proxy. Returns JSON or UTF-8 text responses up to ${MAX_MCP_PROXY_RESPONSE_SIZE_LABEL}; unsafe JSON numbers are strings. Use the HTTP proxy for binary or larger responses.`,
    inputSchema: proxyRequestInputSchema,
    outputSchema: proxyRequestOutputSchema,
    requiredScopes: { every: ['environment:proxy'] },
    audit: { kind: 'no-audit', reason: 'non-auditable' },
    annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true
    },
    async handler({ args, account, environment, plan }) {
        const result = await executeMcpProxyRequest({
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

        return result.isErr() ? Err(proxyRequestErrorToMcp(result.error)) : Ok(result.value);
    }
});
