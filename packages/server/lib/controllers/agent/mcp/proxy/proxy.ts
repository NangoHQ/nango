import tracer from 'dd-trace';

import { getProvider } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { trackAgentSessionProxyRequest } from '../../../../services/agentSessionAnalytics.service.js';
import { executeMcpProxyRequest } from '../../../../services/mcpProxy.service.js';
import { MAX_MCP_PROXY_RESPONSE_SIZE_LABEL } from '../../../../services/mcpProxyResponse.js';
import { proxyRequestOutputSchema } from '../../../../services/mcpProxySchema.js';
import { PublicMcpError } from '../../../mcp/utils.js';
import { notConnectedGuidance } from '../notConnectedGuidance.js';
import { resolveSessionConnection } from '../sessionConnection.js';
import { defineAgentSessionMcpTool } from '../sessionTool.js';
import { proxyErrorToMcp } from './errors.js';
import { rejectedHeaderNames } from './headers.js';
import { proxyInputSchema } from './schema.js';

import type { McpProxyExecution } from '../../../../services/mcpProxy.service.js';
import type { ProxyRequestOutput } from '../../../../services/mcpProxySchema.js';
import type { Result } from '@nangohq/utils';
import type { Span } from 'dd-trace';

export const proxyTool = defineAgentSessionMcpTool({
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
    isEnabled: (metaTools) => metaTools.nangoProxy,
    onInvalidArguments: ({ session }) => {
        trackAgentSessionProxyRequest({ session, errorCode: 'invalid_input' });
    },
    async handler({ args, account, environment, plan, session }) {
        const integrationId = args.integration;

        // Reaching an integration's API is gated on the session declaring it, so a toolset that
        // excluded an integration is not reachable through the escape hatch either.
        if (!Object.hasOwn(session.compiledToolset, integrationId)) {
            trackAgentSessionProxyRequest({ session, integrationId, method: args.method, errorCode: 'unknown_integration' });
            return Err(
                new PublicMcpError(`Integration '${integrationId}' is not one of this session's integrations. Use one this session has.`, {
                    code: 'unknown_integration',
                    integrationId
                })
            );
        }

        const connection = await resolveSessionConnection({ session, integrationId });
        if (!connection) {
            trackAgentSessionProxyRequest({ session, integrationId, method: args.method, errorCode: 'integration_not_connected' });
            return Err(
                new PublicMcpError(
                    `Integration '${integrationId}' has no connection in this session, so no request to it can be authenticated. ${notConnectedGuidance(integrationId, session)}`,
                    { code: 'integration_not_connected', integrationId }
                )
            );
        }

        // Which headers carry the credential depends on the provider, so this is checked here
        // rather than in the input schema, which is built once and knows no integration.
        const rejectedHeaders = rejectedHeaderNames({ headers: args.headers, provider: getProvider(connection.provider) });
        if (rejectedHeaders.length > 0) {
            trackAgentSessionProxyRequest({ session, integrationId, provider: connection.provider, method: args.method, errorCode: 'invalid_input' });
            return Err(
                new PublicMcpError(
                    `Nango sets these headers itself, so they cannot be passed: ${rejectedHeaders.join(', ')}. The request is authenticated with the session's connection, so drop those headers and call again.`,
                    { code: 'invalid_input', integrationId }
                )
            );
        }

        return await tracer.trace<Promise<Result<ProxyRequestOutput>>>('server.mcp.agentSession.proxy', async (span: Span) => {
            span.setTag('nango.agentSessionId', session.id)
                .setTag('nango.accountId', account.id)
                .setTag('nango.environmentId', environment.id)
                .setTag('nango.providerConfigKey', integrationId)
                .setTag('nango.connectionId', connection.connectionId);

            let execution: McpProxyExecution;
            try {
                execution = await executeMcpProxyRequest({
                    account,
                    environment,
                    plan,
                    integrationId,
                    connectionId: connection.connectionId,
                    method: args.method,
                    path: args.path,
                    queryParams: args.query_params,
                    headers: args.headers,
                    body: args.body,
                    actor: { kind: 'session', id: session.id }
                });
            } catch (err) {
                trackAgentSessionProxyRequest({ session, integrationId, provider: connection.provider, method: args.method, errorCode: 'internal_error' });
                throw err;
            }

            const { logCtx, status, result } = execution;

            trackAgentSessionProxyRequest({
                session,
                integrationId,
                provider: connection.provider,
                method: args.method,
                logOperationId: logCtx?.id,
                status,
                errorCode: proxyErrorCode(execution),
                providerErrorCode: providerErrorCode(execution)
            });

            if (result.isErr()) {
                span.setTag('nango.error', result.error);
                return Err(proxyErrorToMcp({ error: result.error, integrationId }));
            }

            return Ok(result.value);
        });
    }
});

/**
 * A provider 4xx or 5xx comes back as a result, not an error, so the outcome is what says the
 * request failed.
 */
function proxyErrorCode({ outcome, result }: McpProxyExecution): string | undefined {
    if (result.isErr()) {
        return result.error.code;
    }
    return outcome === 'upstream_error' ? 'upstream_error' : undefined;
}

function providerErrorCode({ result }: McpProxyExecution): string | undefined {
    return result.isErr() && 'providerCode' in result.error ? result.error.providerCode : undefined;
}
