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
import { defineAgentSessionMcpTool, invalidArgumentsOf } from '../sessionTool.js';
import { proxyErrorToMcp } from './errors.js';
import { rejectedHeaderNames } from './headers.js';
import { proxyInputSchema } from './schema.js';

import type { McpProxyExecution } from '../../../../services/mcpProxy.service.js';
import type { ProxyRequestOutput } from '../../../../services/mcpProxySchema.js';
import type { Result } from '@nangohq/utils';
import type { Span } from 'dd-trace';

const PROVIDER_ERROR_CODE = /^[A-Za-z0-9][\w.:-]{0,63}$/;

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
            integrationId: proxyInputSchema.shape.integration.safeParse(raw['integration']).data,
            method: proxyInputSchema.shape.method.safeParse(raw['method']).data,
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

function providerErrorCode({ outcome, result, status }: McpProxyExecution): string | undefined {
    if (result.isErr()) {
        return 'providerCode' in result.error ? result.error.providerCode : undefined;
    }
    return outcome === 'upstream_error' ? errorCodeInBody(result.value.body, status) : undefined;
}

/**
 * Reads the code from the error shapes providers commonly answer with, never the message, which can
 * repeat what the agent sent. Only a value that looks like a code is kept.
 */
function errorCodeInBody(body: unknown, status: number | undefined): string | undefined {
    const root = Array.isArray(body) ? arrayHead(body) : body;
    const error = field(root, 'error');
    const firstError = arrayHead(field(root, 'errors'));
    const candidates = [
        field(error, 'code'),
        field(error, 'status'),
        field(error, 'type'),
        error,
        field(root, 'code'),
        field(root, 'errorCode'),
        field(root, 'error_code'),
        field(root, 'category'),
        field(firstError, 'code'),
        field(field(firstError, 'extensions'), 'code'),
        field(firstError, 'type')
    ];
    return candidates.map((candidate) => asErrorCode(candidate, status)).find((code) => code !== undefined);
}

/** A numeric code is kept unless it only repeats the HTTP status, as Google's error.code does. */
function asErrorCode(candidate: unknown, status: number | undefined): string | undefined {
    if (typeof candidate === 'number') {
        return Number.isInteger(candidate) && candidate !== status ? String(candidate) : undefined;
    }
    return typeof candidate === 'string' && PROVIDER_ERROR_CODE.test(candidate) ? candidate : undefined;
}

function field(value: unknown, key: string): unknown {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : undefined;
}

function arrayHead(value: unknown): unknown {
    return Array.isArray(value) ? value[0] : undefined;
}
