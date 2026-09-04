import { Err, getLogger, Ok } from '@nangohq/utils';

import proxyService from '../../../services/proxy.service.js';
import { egressTelemetryRecorder } from '../../../utils/egressTelemetry.js';
import { InternalMcpError, PublicMcpError } from '../utils.js';
import { proxyResponseToMcp } from './formatter.js';
import { ProxyResponseFormatError, readProxyResponseBody } from './response.js';

import type { ProxyServiceError, ProxyServiceResponse } from '../../../services/proxy.service.js';
import type { ProxyQueryParams, ProxyRequestOutput } from './schema.js';
import type { DBEnvironment, DBPlan, DBTeam, HTTP_METHOD } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const logger = getLogger('Server.MCP.Proxy');

export interface McpProxyRequest {
    account: DBTeam;
    environment: DBEnvironment;
    plan: DBPlan | null;
    integrationId: string;
    connectionId: string;
    method: HTTP_METHOD;
    path: string;
    queryParams?: ProxyQueryParams | undefined;
    headers?: Record<string, string> | undefined;
    body?: unknown;
    baseUrlOverride?: string | undefined;
    retries?: number | undefined;
    decompress?: boolean | undefined;
    retryOn?: number[] | undefined;
    forwardHeadersOnRedirect?: boolean | undefined;
}

/**
 * The single path every MCP proxy caller goes through, so credential handling, the outbound URL
 * policy, plan capping and the response size limit are enforced once rather than per tool.
 */
export async function executeMcpProxyRequest(params: McpProxyRequest): Promise<Result<ProxyRequestOutput>> {
    const { account, environment, integrationId, connectionId } = params;

    const execution = await proxyService.request({
        account,
        environment,
        plan: params.plan,
        method: params.method,
        endpoint: appendQueryParams(params.path, params.queryParams),
        integrationId,
        connectionId,
        headers: withDefaultJsonContentType(params.headers, params.body),
        body: serializeJsonBody(params.body),
        retries: params.retries,
        baseUrlOverride: params.baseUrlOverride,
        decompress: params.decompress,
        retryOn: params.retryOn,
        forwardHeadersOnRedirect: params.forwardHeadersOnRedirect
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
            integrationId,
            connectionId,
            callsite: 'proxy',
            egressedBytes: responseBody.length,
            count: 1
        });
        completeProxyResponse(response);
        return Ok(output);
    } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to format the provider response');
        void execution.logCtx?.error('Failed to format provider response for MCP', { error });
        completeProxyResponse(response, error);
        if (err instanceof ProxyResponseFormatError) {
            return Err(new PublicMcpError(err.message));
        }
        throw err;
    }
}

function completeProxyResponse(response: Pick<ProxyServiceResponse, 'complete'>, error?: Error): void {
    void response.complete(error).catch((err: unknown) => {
        const completionError = err instanceof Error ? err : new Error('Failed to complete MCP proxy response');
        logger.error('Failed to complete MCP proxy response', { error: completionError });
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
function appendQueryParams(path: string, queryParams: ProxyQueryParams | undefined): string {
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
