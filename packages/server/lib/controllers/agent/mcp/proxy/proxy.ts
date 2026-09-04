import tracer from 'dd-trace';

import { Err } from '@nangohq/utils';

import { executeMcpProxyRequest, MAX_MCP_PROXY_RESPONSE_SIZE_LABEL, mcpProxyResponseSchema } from '../../../../services/mcpProxy.service.js';
import { PublicMcpError } from '../../../mcp/utils.js';
import { defineAgentSessionMcpTool } from '../sessionTool.js';
import { proxyInputSchema } from './schema.js';

import type { McpProxyResponse } from '../../../../services/mcpProxy.service.js';
import type { Result } from '@nangohq/utils';
import type { Span } from 'dd-trace';

export const proxyTool = defineAgentSessionMcpTool({
    name: 'nango_proxy',
    description: `Make an authenticated HTTP request to a provider API, on the connection this session resolved for the integration. The escape hatch for when no tool covers what you need, so search with nango_tool_search first and use this only if nothing fits. Returns JSON or UTF-8 text responses up to ${MAX_MCP_PROXY_RESPONSE_SIZE_LABEL}.`,
    inputSchema: proxyInputSchema,
    outputSchema: mcpProxyResponseSchema,
    annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true
    },
    isEnabled: (metaTools) => metaTools.nangoProxy,
    async handler({ args, account, environment, plan, session }) {
        const integrationId = args.integration;

        // Reaching an integration's API is gated on the session declaring it, so a toolset that
        // excluded an integration is not reachable through the escape hatch either.
        if (!Object.hasOwn(session.compiledToolset, integrationId)) {
            return Err(new PublicMcpError(`Integration '${integrationId}' is not one of this session's integrations.`));
        }

        const connection = Object.hasOwn(session.resolvedConnections, integrationId) ? session.resolvedConnections[integrationId] : undefined;
        if (!connection) {
            return Err(new PublicMcpError(`Integration '${integrationId}' has no connection in this session.`));
        }

        return await tracer.trace<Promise<Result<McpProxyResponse>>>('server.mcp.agentSession.proxy', async (span: Span) => {
            span.setTag('nango.agentSessionId', session.id)
                .setTag('nango.accountId', account.id)
                .setTag('nango.environmentId', environment.id)
                .setTag('nango.providerConfigKey', integrationId)
                .setTag('nango.connectionId', connection.connectionId);

            const result = await executeMcpProxyRequest({
                account,
                environment,
                plan,
                integrationId,
                connectionId: connection.connectionId,
                method: args.method,
                path: args.path,
                queryParams: args.query_params,
                headers: args.headers,
                body: args.body
            });

            if (result.isErr()) {
                span.setTag('nango.error', result.error);
            }

            return result;
        });
    }
});
