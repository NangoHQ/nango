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
import type * as z from 'zod/v4';

/** Arguments that failed validation are whatever the agent sent, so each is capped like a valid one. */
const MAX_TRACKED_INTEGRATION_LENGTH = 255;
const MAX_TRACKED_GOAL_LENGTH = 500;
const MAX_TRACKED_INTENT_LENGTH = 255;
const MAX_TRACKED_INVALID_ARGUMENTS = 10;

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
    onInvalidArguments: ({ session }, { args, error }) => {
        const raw: Record<string, unknown> = typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {};
        trackAgentSessionProxyRequest({
            session,
            integrationId: rawString(raw['integration'], MAX_TRACKED_INTEGRATION_LENGTH),
            method: proxyInputSchema.shape.method.safeParse(raw['method']).data,
            path: rawString(raw['path']),
            goal: rawString(raw['goal'], MAX_TRACKED_GOAL_LENGTH),
            intent: rawString(raw['intent'], MAX_TRACKED_INTENT_LENGTH),
            errorCode: 'invalid_input',
            invalidArguments: invalidArgumentsOf(error)
        });
    },
    async handler({ args, account, environment, plan, session }) {
        const integrationId = args.integration;
        const purpose = { goal: args.goal, intent: args.intent };
        const track = (outcome: ProxyRequestOutcome) => {
            trackAgentSessionProxyRequest({ session, integrationId, method: args.method, path: args.path, ...purpose, ...outcome });
        };

        // Reaching an integration's API is gated on the session declaring it, so a toolset that
        // excluded an integration is not reachable through the escape hatch either.
        if (!Object.hasOwn(session.compiledToolset, integrationId)) {
            track({ errorCode: 'unknown_integration' });
            return Err(
                new PublicMcpError(`Integration '${integrationId}' is not one of this session's integrations. Use one this session has.`, {
                    code: 'unknown_integration',
                    integrationId
                })
            );
        }

        const connection = await resolveSessionConnection({ session, integrationId });
        if (!connection) {
            track({ errorCode: 'integration_not_connected' });
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
            track({ provider: connection.provider, errorCode: 'invalid_input', invalidArguments: ['headers: credential_header'] });
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
                    actor: { kind: 'session', id: session.id },
                    logMeta: purpose
                });
            } catch (err) {
                track({ provider: connection.provider, errorCode: 'internal_error' });
                throw err;
            }

            const { logCtx, status, result } = execution;

            track({
                provider: connection.provider,
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

interface ProxyRequestOutcome {
    provider?: string | undefined;
    logOperationId?: string | undefined;
    status?: number | undefined;
    errorCode?: string | undefined;
    providerErrorCode?: string | undefined;
    invalidArguments?: string[] | undefined;
}

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

/**
 * The top level argument and the zod issue code only. The issue message can quote what the agent sent,
 * and a deeper path can be a key that carries data, like a query parameter name.
 */
function invalidArgumentsOf(error: z.ZodError): string[] {
    const invalid = error.issues.flatMap((issue) => {
        if (issue.code === 'unrecognized_keys' && issue.path.length === 0) {
            return issue.keys.map((key) => `${key}: unrecognized_key`);
        }
        return [`${issue.path.length > 0 ? String(issue.path[0]) : 'arguments'}: ${issue.code}`];
    });
    return [...new Set(invalid)].slice(0, MAX_TRACKED_INVALID_ARGUMENTS);
}

function rawString(value: unknown, maxLength?: number): string | undefined {
    return typeof value === 'string' ? value.slice(0, maxLength) : undefined;
}
