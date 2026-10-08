import { Client, ProtocolError, SdkError, SdkErrorCode, SdkHttpError, StreamableHTTPClientTransport, UnauthorizedError } from '@modelcontextprotocol/client';
import { ZodError } from 'zod';

import { getProvider } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { completeProxyResponse } from './mcpProxy.service.js';
import { MAX_MCP_PROXY_RESPONSE_SIZE_LABEL, ProxyResponseFormatError, readProxyResponseBody } from './mcpProxyResponse.js';
import proxyService from './proxy.service.js';

import type { ProxyServiceError } from './proxy.service.js';
import type { FetchLike, Tool } from '@modelcontextprotocol/client';
import type { DBEnvironment, DBPlan, DBTeam, HTTP_METHOD, OperationActor } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const CLIENT_INFO = { name: 'nango-agent-session', version: '1.0.0' };

// The transport insists on a URL, but every request goes through the proxy, which ignores it.
const PROXY_PLACEHOLDER_URL = new URL('https://nango-proxy.invalid/');

const MAX_TOOL_LIST_PAGES = 20;

export interface RemoteMcpTool {
    name: string;
    description?: string | undefined;
    inputSchema: Record<string, unknown>;
    annotations?: Record<string, unknown> | undefined;
}

export type RemoteMcpErrorCode = 'proxy_failed' | 'http_error' | 'invalid_response' | 'response_too_large' | 'rpc_error' | 'timeout';

export class RemoteMcpError extends Error {
    public readonly code: RemoteMcpErrorCode;
    public readonly status: number | undefined;
    /** The JSON-RPC method that failed. */
    public readonly method: string | undefined;

    constructor({
        code,
        message,
        status,
        method,
        cause
    }: {
        code: RemoteMcpErrorCode;
        message: string;
        status?: number | undefined;
        method?: string | undefined;
        cause?: unknown;
    }) {
        super(message, { cause });
        this.name = 'RemoteMcpError';
        this.code = code;
        this.status = status;
        this.method = method;
    }

    get proxyError(): ProxyServiceError | undefined {
        return this.code === 'proxy_failed' ? (this.cause as ProxyServiceError) : undefined;
    }
}

export interface RemoteMcpTarget {
    account: DBTeam;
    environment: DBEnvironment;
    plan: DBPlan | null;
    integrationId: string;
    connectionId: string;
    provider: string;
    actor?: OperationActor | undefined;
}

export interface RemoteMcpRun<T> {
    /** Every request of one MCP session is logged under a single proxy operation. */
    logOperationId: string | undefined;
    result: Result<T, RemoteMcpError>;
}

export function mcpEndpointOf(provider: string): string | undefined {
    return getProvider(provider)?.mcp_endpoint;
}

/**
 * Opens an MCP session on the integration's server, runs `fn` in it, and closes it. The MCP SDK
 * speaks the protocol, and its requests are sent through the Nango proxy, so the connection's
 * credentials are applied and refreshed the way any proxy call has them.
 */
export async function withRemoteMcpSession<T>(
    target: RemoteMcpTarget,
    fn: (client: Client) => Promise<Result<T, RemoteMcpError>>,
    { signal }: { signal?: AbortSignal } = {}
): Promise<RemoteMcpRun<T>> {
    const endpoint = mcpEndpointOf(target.provider);
    if (!endpoint) {
        return {
            logOperationId: undefined,
            result: Err(new RemoteMcpError({ code: 'invalid_response', message: `Provider '${target.provider}' has no MCP endpoint` }))
        };
    }

    const log: { operationId: string | undefined } = { operationId: undefined };
    const transport = new StreamableHTTPClientTransport(PROXY_PLACEHOLDER_URL, { fetch: proxyFetch({ target, endpoint, log }) });
    const client = new Client(CLIENT_INFO, { capabilities: {} });

    try {
        try {
            await client.connect(transport, signal ? { signal } : undefined);
        } catch (err) {
            return { logOperationId: log.operationId, result: Err(toRemoteMcpError(err, 'initialize')) };
        }

        const result = await fn(client);
        return { logOperationId: log.operationId, result };
    } finally {
        await transport.terminateSession().catch(() => undefined);
        await client.close().catch(() => undefined);
    }
}

/**
 * Pages through `tools/list` until the server stops handing back a cursor, `maxTools` is reached, or
 * the page guard trips, which stops a server that keeps handing out cursors from paging forever.
 */
export async function listRemoteTools(
    client: Client,
    { maxTools, signal }: { maxTools: number; signal?: AbortSignal }
): Promise<Result<RemoteMcpTool[], RemoteMcpError>> {
    const tools: RemoteMcpTool[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < MAX_TOOL_LIST_PAGES && tools.length < maxTools; page++) {
        let listed: { tools: Tool[]; nextCursor?: string | undefined };
        try {
            listed = await client.listTools(cursor ? { cursor } : undefined, signal ? { signal } : undefined);
        } catch (err) {
            return Err(toRemoteMcpError(err, 'tools/list'));
        }

        tools.push(...listed.tools.map(toRemoteTool));

        cursor = listed.nextCursor;
        if (!cursor) {
            break;
        }
    }

    return Ok(tools.slice(0, maxTools));
}

export function toRemoteMcpError(err: unknown, method: string): RemoteMcpError {
    if (err instanceof RemoteMcpError) {
        return err;
    }

    if (err instanceof UnauthorizedError) {
        return new RemoteMcpError({ code: 'http_error', message: 'The MCP server refused the credentials', status: 401, method, cause: err });
    }

    if (isTimeout(err)) {
        return new RemoteMcpError({ code: 'timeout', message: `The MCP server did not answer ${method} in time`, method, cause: err });
    }

    if (err instanceof SdkHttpError) {
        return new RemoteMcpError({ code: 'http_error', message: `The MCP server answered with HTTP ${err.status}`, status: err.status, method, cause: err });
    }

    if (err instanceof ProtocolError) {
        return new RemoteMcpError({ code: 'rpc_error', message: `The MCP server rejected ${method}: ${err.message}`, method, cause: err });
    }

    if (err instanceof SdkError) {
        return new RemoteMcpError({ code: 'invalid_response', message: err.message, method, cause: err });
    }

    if (err instanceof ZodError || err instanceof SyntaxError) {
        return new RemoteMcpError({ code: 'invalid_response', message: 'The body is not a JSON-RPC message', method, cause: err });
    }

    throw err;
}

function isTimeout(err: unknown): boolean {
    return err instanceof SdkError && err.code === SdkErrorCode.RequestTimeout;
}

function toRemoteTool(tool: Tool): RemoteMcpTool {
    return {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        ...(tool.annotations ? { annotations: tool.annotations } : {})
    };
}

/**
 * Hands the SDK's requests to the Nango proxy and gives back what the server answered. The proxy
 * cannot hold a server-initiated event stream open, so the GET that would start one is answered
 * with 405 here, which tells the SDK the server offers none.
 */
function proxyFetch({ target, endpoint, log }: { target: RemoteMcpTarget; endpoint: string; log: { operationId: string | undefined } }): FetchLike {
    return async (_url, init) => {
        const method = (init?.method ?? 'GET').toUpperCase() as HTTP_METHOD;
        if (method === 'GET') {
            return new Response(null, { status: 405 });
        }

        const execution = await proxyService.request({
            account: target.account,
            environment: target.environment,
            plan: target.plan,
            method,
            endpoint,
            integrationId: target.integrationId,
            connectionId: target.connectionId,
            headers: toRecord(new Headers(init?.headers)),
            body: typeof init?.body === 'string' ? init.body : undefined,
            retries: 0,
            abortSignal: init?.signal ?? undefined,
            actor: target.actor,
            activityLogId: log.operationId
        });
        log.operationId ??= execution.logCtx?.id;

        if (execution.result.isErr()) {
            throw new RemoteMcpError({ code: 'proxy_failed', message: execution.result.error.message, cause: execution.result.error });
        }

        const response = execution.result.value;

        let body: Buffer;
        try {
            body = await readProxyResponseBody(response);
        } catch (err) {
            completeProxyResponse(response, err instanceof Error ? err : new Error('Failed to read the MCP server response'));
            throw unreadableResponseError(err, response.status);
        }
        completeProxyResponse(response);

        return new Response(body.length > 0 ? new Uint8Array(body) : null, { status: response.status, headers: toHeaders(response.headers) });
    };
}

function toRecord(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, name) => {
        result[name] = value;
    });
    return result;
}

function toHeaders(headers: Record<string, unknown>): Headers {
    const result = new Headers();
    for (const [name, value] of Object.entries(headers)) {
        if (typeof value === 'string') {
            result.set(name, value);
        } else if (Array.isArray(value)) {
            result.set(name, value.join(', '));
        }
    }
    return result;
}

function unreadableResponseError(err: unknown, status: number): RemoteMcpError {
    if (err instanceof ProxyResponseFormatError && err.code === 'response_too_large') {
        return new RemoteMcpError({
            code: 'response_too_large',
            message: `The MCP server response exceeds the ${MAX_MCP_PROXY_RESPONSE_SIZE_LABEL} limit`,
            status,
            cause: err
        });
    }

    if (err instanceof ProxyResponseFormatError) {
        return new RemoteMcpError({ code: 'invalid_response', message: 'The body is binary or not UTF-8', status, cause: err });
    }

    return new RemoteMcpError({ code: 'invalid_response', message: 'The MCP server response could not be read', status, cause: err });
}
