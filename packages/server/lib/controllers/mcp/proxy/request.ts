import { Err, getLogger, Ok } from '@nangohq/utils';

import proxyService from '../../../services/proxy.service.js';
import { egressTelemetryRecorder } from '../../../utils/egressTelemetry.js';
import { defineManagementMcpTool } from '../managementTool.js';
import { InternalMcpError, PublicMcpError } from '../utils.js';
import { proxyResponseToMcp } from './formatter.js';
import { MAX_MCP_PROXY_RESPONSE_SIZE_LABEL, ProxyResponseFormatError, readProxyResponseBody } from './response.js';
import { proxyRequestInputSchema, proxyRequestOutputSchema } from './schema.js';

import type { ProxyServiceError, ProxyServiceResponse } from '../../../services/proxy.service.js';
import type { ManagementMcpTool } from '../managementTool.js';
import type { ProxyRequestOutput } from './schema.js';

const logger = getLogger('Server.MCP.Proxy');

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
        const body = serializeJsonBody(args.body);
        const headers = withDefaultJsonContentType(args.headers, args.body);
        const execution = await proxyService.request({
            account,
            environment,
            plan,
            method: args.method,
            endpoint: appendQueryParams(args.path, args.query_params),
            integrationId: args.integration_id,
            connectionId: args.connection_id,
            headers,
            body,
            retries: args.retries,
            baseUrlOverride: args.base_url_override,
            decompress: args.decompress,
            retryOn: args.retry_on,
            forwardHeadersOnRedirect: args.forward_headers_on_redirect
        });

        if (execution.result.isErr()) {
            return Err(proxyServiceErrorToMcp(execution.result.error));
        }

        const response = execution.result.value;
        try {
            const responseBody = await readProxyResponseBody(response);
            const output = proxyResponseToMcp(response, responseBody);
            egressTelemetryRecorder.record({
                accountId: account.id,
                environmentId: environment.id,
                environmentName: environment.name,
                integrationId: args.integration_id,
                connectionId: args.connection_id,
                callsite: 'proxy',
                egressedBytes: responseBody.length,
                count: 1
            });
            completeProxyResponse(response);
            return Ok(output);
        } catch (err) {
            const error = err instanceof Error ? err : new Error('Failed to format the provider response');
            void execution.logCtx?.error('Failed to format provider response for Management MCP', { error });
            completeProxyResponse(response, error);
            if (err instanceof ProxyResponseFormatError) {
                return Err(new PublicMcpError(err.message));
            }
            throw err;
        }
    }
});

function completeProxyResponse(response: Pick<ProxyServiceResponse, 'complete'>, error?: Error): void {
    void response.complete(error).catch((err: unknown) => {
        const completionError = err instanceof Error ? err : new Error('Failed to complete Management MCP proxy response');
        logger.error('Failed to complete Management MCP proxy response', { error: completionError });
    });
}

// Axios treats falsy primitives as empty request bodies. Serialize MCP JSON primitives here so
// the shared proxy can sign, canonicalize, and send the exact JSON bytes supplied by the caller.
function serializeJsonBody(body: unknown): unknown {
    if (body === undefined || (body !== null && typeof body === 'object')) {
        return body;
    }
    return JSON.stringify(body);
}

function withDefaultJsonContentType(headers: Record<string, string> | undefined, body: unknown): Record<string, string> | undefined {
    if (body === undefined || Object.keys(headers ?? {}).some((name) => name.toLowerCase() === 'content-type')) {
        return headers;
    }
    return { ...headers, 'content-type': 'application/json' };
}

// Appends URL-encoded query parameters to the path, preserving existing parameters and serializing arrays as repeated keys.
function appendQueryParams(path: string, queryParams: Record<string, string | number | (string | number)[]> | undefined): string {
    if (!queryParams || Object.keys(queryParams).length === 0) {
        return path;
    }

    const separator = path.includes('?') ? '&' : '?';
    const searchParams = new URLSearchParams();
    for (const [name, value] of Object.entries(queryParams)) {
        const values = Array.isArray(value) ? value : [value];
        for (const item of values) {
            searchParams.append(name, String(item));
        }
    }
    return `${path}${separator}${searchParams.toString()}`;
}

function proxyServiceErrorToMcp(error: ProxyServiceError): Error {
    const code = error.code;
    switch (code) {
        case 'base_url_override_disabled':
        case 'base_url_override_not_allowed':
        case 'plan_limit':
        case 'unknown_integration':
        case 'connection_not_found':
        case 'connection_refresh_backoff':
        case 'credentials_refresh_failed':
        case 'proxy_request_failed':
            return new PublicMcpError(error.message);
        case 'internal_error':
            return error;
        default: {
            const exhaustiveCheck: never = code;
            logger.error('Unexpected ProxyService error code while proxying request', { code: exhaustiveCheck });
            return new InternalMcpError();
        }
    }
}
