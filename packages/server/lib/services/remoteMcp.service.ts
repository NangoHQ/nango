import { z } from 'zod';

import { getProvider } from '@nangohq/shared';
import { Err, getLogger, Ok } from '@nangohq/utils';

import { readProxyResponseBody } from './mcpProxyResponse.js';
import proxyService from './proxy.service.js';

import type { ProxyServiceResponse } from './proxy.service.js';
import type { DBEnvironment, DBPlan, DBTeam, HTTP_METHOD, OperationActor } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const logger = getLogger('Server.RemoteMcp');

const PROTOCOL_VERSION = '2025-06-18';
const CLIENT_INFO = { name: 'nango-agent-session', version: '1.0.0' };

const MAX_TOOL_LIST_PAGES = 20;

const jsonRpcMessageSchema = z.looseObject({
    jsonrpc: z.literal('2.0'),
    id: z.union([z.string(), z.number(), z.null()]).optional(),
    result: z.unknown().optional(),
    error: z.looseObject({ code: z.number(), message: z.string() }).optional()
});

const initializeResultSchema = z.looseObject({ protocolVersion: z.string() });

const remoteToolSchema = z.looseObject({
    name: z.string().min(1),
    description: z.string().optional(),
    inputSchema: z.looseObject({ type: z.literal('object') }),
    annotations: z.record(z.string(), z.unknown()).optional()
});

const toolsListResultSchema = z.looseObject({
    tools: z.array(z.unknown()),
    nextCursor: z.string().optional()
});

export type RemoteMcpTool = z.infer<typeof remoteToolSchema>;

type JsonRpcMessage = z.infer<typeof jsonRpcMessageSchema>;

export type RemoteMcpErrorCode = 'proxy_failed' | 'http_error' | 'invalid_response' | 'rpc_error';

export class RemoteMcpError extends Error {
    public readonly code: RemoteMcpErrorCode;
    public readonly status: number | undefined;

    constructor({ code, message, status, cause }: { code: RemoteMcpErrorCode; message: string; status?: number | undefined; cause?: unknown }) {
        super(message, { cause });
        this.name = 'RemoteMcpError';
        this.code = code;
        this.status = status;
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

export interface RemoteMcpSession {
    request: (method: string, params?: Record<string, unknown>) => Promise<Result<unknown, RemoteMcpError>>;
}

export interface RemoteMcpRun<T> {
    /** Every request of one MCP session is logged under a single proxy operation. */
    logOperationId: string | undefined;
    result: Result<T, RemoteMcpError>;
}

interface SessionState {
    target: RemoteMcpTarget;
    endpoint: string;
    protocolVersion: string;
    sessionId: string | undefined;
    nextId: number;
    logOperationId: string | undefined;
}

/** The path a provider's MCP server answers on, or undefined when its tools cannot be passed through. */
export function mcpEndpointOf(provider: string): string | undefined {
    return getProvider(provider)?.mcp_endpoint;
}

/**
 * Opens an MCP session on the integration's server through the Nango proxy, so the connection's
 * credentials are applied and refreshed the way any proxy call has them, runs `fn` in it, and
 * closes it.
 */
export async function withRemoteMcpSession<T>(
    target: RemoteMcpTarget,
    fn: (session: RemoteMcpSession) => Promise<Result<T, RemoteMcpError>>
): Promise<RemoteMcpRun<T>> {
    const endpoint = mcpEndpointOf(target.provider);
    if (!endpoint) {
        return {
            logOperationId: undefined,
            result: Err(new RemoteMcpError({ code: 'invalid_response', message: `Provider '${target.provider}' has no MCP endpoint` }))
        };
    }

    const state: SessionState = { target, endpoint, protocolVersion: PROTOCOL_VERSION, sessionId: undefined, nextId: 1, logOperationId: undefined };

    const initialized = await initialize(state);
    if (initialized.isErr()) {
        return { logOperationId: state.logOperationId, result: Err(initialized.error) };
    }

    try {
        const result = await fn({ request: async (method, params) => await rpc(state, method, params) });
        return { logOperationId: state.logOperationId, result };
    } finally {
        if (state.sessionId) {
            const closed = await send(state, 'DELETE');
            if (closed.isErr()) {
                logger.info('Could not close the remote MCP session', { integrationId: target.integrationId, error: closed.error.message });
            }
        }
    }
}

/**
 * Pages through `tools/list` until the server stops handing back a cursor or `maxTools` is reached.
 * A tool the server describes in a shape MCP does not allow is dropped rather than failing the list.
 */
export async function listRemoteTools(session: RemoteMcpSession, { maxTools }: { maxTools: number }): Promise<Result<RemoteMcpTool[], RemoteMcpError>> {
    const tools: RemoteMcpTool[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < MAX_TOOL_LIST_PAGES && tools.length < maxTools; page++) {
        const response = await session.request('tools/list', cursor ? { cursor } : undefined);
        if (response.isErr()) {
            return Err(response.error);
        }

        const parsed = toolsListResultSchema.safeParse(response.value);
        if (!parsed.success) {
            return Err(new RemoteMcpError({ code: 'invalid_response', message: 'The MCP server returned an invalid tools/list result' }));
        }

        for (const tool of parsed.data.tools) {
            const valid = remoteToolSchema.safeParse(tool);
            if (valid.success) {
                tools.push(valid.data);
            }
        }

        cursor = parsed.data.nextCursor;
        if (!cursor) {
            break;
        }
    }

    return Ok(tools.slice(0, maxTools));
}

async function initialize(state: SessionState): Promise<Result<void, RemoteMcpError>> {
    const result = await rpc(state, 'initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO });
    if (result.isErr()) {
        return Err(result.error);
    }

    const parsed = initializeResultSchema.safeParse(result.value);
    if (!parsed.success) {
        return Err(new RemoteMcpError({ code: 'invalid_response', message: 'The MCP server returned an invalid initialize result' }));
    }
    state.protocolVersion = parsed.data.protocolVersion;

    const initialized = await send(state, 'POST', { jsonrpc: '2.0', method: 'notifications/initialized' });
    return initialized.isErr() ? Err(initialized.error) : Ok(undefined);
}

async function rpc(state: SessionState, method: string, params?: Record<string, unknown>): Promise<Result<unknown, RemoteMcpError>> {
    const id = state.nextId++;
    const response = await send(state, 'POST', { jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });
    if (response.isErr()) {
        return Err(response.error);
    }

    const message = response.value.find((candidate) => candidate.id === id);
    if (!message) {
        return Err(new RemoteMcpError({ code: 'invalid_response', message: `The MCP server sent no response to ${method}` }));
    }

    if (message.error) {
        return Err(new RemoteMcpError({ code: 'rpc_error', message: `The MCP server rejected ${method}: ${message.error.message}` }));
    }

    return Ok(message.result);
}

async function send(state: SessionState, method: HTTP_METHOD, body?: unknown): Promise<Result<JsonRpcMessage[], RemoteMcpError>> {
    const { target } = state;

    const execution = await proxyService.request({
        account: target.account,
        environment: target.environment,
        plan: target.plan,
        method,
        endpoint: state.endpoint,
        integrationId: target.integrationId,
        connectionId: target.connectionId,
        headers: {
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
            'mcp-protocol-version': state.protocolVersion,
            ...(state.sessionId ? { 'mcp-session-id': state.sessionId } : {})
        },
        body,
        retries: 0,
        actor: target.actor,
        activityLogId: state.logOperationId
    });
    state.logOperationId ??= execution.logCtx?.id;

    if (execution.result.isErr()) {
        return Err(new RemoteMcpError({ code: 'proxy_failed', message: execution.result.error.message, cause: execution.result.error }));
    }

    const response = execution.result.value;

    let text: string;
    try {
        text = (await readProxyResponseBody(response)).toString('utf8');
    } catch (err) {
        complete(response, err instanceof Error ? err : new Error('Failed to read the MCP server response'));
        return Err(new RemoteMcpError({ code: 'invalid_response', message: 'The MCP server response could not be read', status: response.status, cause: err }));
    }
    complete(response);

    if (response.outcome === 'upstream_error') {
        return Err(new RemoteMcpError({ code: 'http_error', message: `The MCP server answered with HTTP ${response.status}`, status: response.status }));
    }

    const sessionId = response.headers['mcp-session-id'];
    if (typeof sessionId === 'string' && sessionId) {
        state.sessionId = sessionId;
    }

    const messages = parseMessages({ contentType: response.headers['content-type'], text });
    if (!messages) {
        return Err(new RemoteMcpError({ code: 'invalid_response', message: 'The MCP server returned a body that is not JSON-RPC', status: response.status }));
    }

    return Ok(messages);
}

function complete(response: ProxyServiceResponse, error?: Error): void {
    void response.complete(error).catch((err: unknown) => {
        logger.error('Failed to complete the remote MCP proxy response', { error: err });
    });
}

/** A streamable HTTP server answers either with JSON or with an event stream whose events carry the messages. */
export function parseMessages({ contentType, text }: { contentType: unknown; text: string }): JsonRpcMessage[] | null {
    if (text.trim() === '') {
        return [];
    }

    const payloads =
        typeof contentType === 'string' && contentType.includes('text/event-stream')
            ? text
                  .split(/\r?\n\r?\n/)
                  .map((event) =>
                      event
                          .split(/\r?\n/)
                          .filter((line) => line.startsWith('data:'))
                          .map((line) => line.slice(5).trimStart())
                          .join('\n')
                  )
                  .filter(Boolean)
            : [text];

    const messages: JsonRpcMessage[] = [];
    for (const payload of payloads) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(payload);
        } catch {
            return null;
        }

        for (const candidate of Array.isArray(parsed) ? parsed : [parsed]) {
            const message = jsonRpcMessageSchema.safeParse(candidate);
            if (!message.success) {
                return null;
            }
            messages.push(message.data);
        }
    }

    return messages;
}
