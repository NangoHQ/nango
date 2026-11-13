import { AsyncLocalStorage } from 'node:async_hooks';

import { productTracking } from '@nangohq/shared';

import { isPlaygroundSession } from './agentPlaygroundTags.js';

import type { CreateAgentSessionParams } from './agentSession.service.js';
import type { CallToolResult } from '@modelcontextprotocol/server';
import type {
    AgentSession,
    AgentSessionMetaTool,
    AgentSessionToolSearchHit,
    AgentSessionToolsetPolicy,
    AnalyticsEventProperties,
    FunctionSource,
    HTTP_METHOD,
    PostAgentSessionsBody
} from '@nangohq/types';

type ToolCallMeasurement = Pick<AnalyticsEventProperties<'agents:tool_call_complete'>, 'result_size_bytes' | 'result_token_estimate' | 'call_duration_ms'>;

type MeasuredSend = (measurement: ToolCallMeasurement) => void;

type SessionRequest = Pick<CreateAgentSessionParams, 'connections' | 'toolset' | 'pinnedTools' | 'metaTools' | 'expiresInMs'>;
type TrackedRequest = AnalyticsEventProperties<'agents:session_start'>['request'];
type TrackedPolicy = NonNullable<Exclude<TrackedRequest['toolset'], '*'>>[string];

const BYTES_PER_TOKEN = 4;

/** Integration ids and tool names together, so the request stays small whatever the caller sent. */
const MAX_TRACKED_REQUEST_NAMES = 250;

const pendingToolCallEvents = new AsyncLocalStorage<MeasuredSend[]>();

interface Outcome {
    logOperationId?: string | undefined;
    errorCode?: string | undefined;
}

interface ToolCallParams extends Outcome {
    /** Unset when the agent called an integration tool directly, by the name it is listed under. */
    metaTool?: AgentSessionMetaTool | undefined;
    session: AgentSession;
    /** Unset when the call named a tool the session could not resolve to an integration. */
    integrationId?: string | undefined;
    /** Unset for a meta tool that runs no integration tool of its own, like asking for a connect link. */
    toolName?: string | undefined;
    /** Pinned tools are listed, searchable ones answer to their name without being listed. Both are callable directly. */
    pinned?: boolean | undefined;
    /** Names the underlying failure when the action ran and failed, rather than being rejected before it ran. */
    underlyingErrorCode?: string | undefined;
    /** Set when the tool ran on the integration's MCP server rather than as a deployed action. */
    mcpTool?: boolean | undefined;
    functionSource?: FunctionSource | undefined;
    goal?: string | undefined;
    intent?: string | undefined;
}

interface ToolSearchParams extends Outcome {
    session: AgentSession;
    query?: string | undefined;
    goal?: string | undefined;
    matches: AgentSessionToolSearchHit[];
    related: AgentSessionToolSearchHit[];
}

interface ProxyRequestParams extends Outcome {
    session: AgentSession;
    integrationId?: string | undefined;
    method?: HTTP_METHOD | undefined;
    path?: string | undefined;
    provider?: string | undefined;
    status?: number | undefined;
    /** The provider's own error code, when the failure carried one. */
    providerErrorCode?: string | undefined;
    goal?: string | undefined;
    /** Why no tool fit and which one would have, so gaps in the catalog show up. */
    intent?: string | undefined;
}

/**
 * The account, the environment as is_production and the surface are stamped by the tracking context
 * middleware, so nothing here passes them. No tool input and no provider response is sent, on purpose.
 */
export function trackAgentSessionCreated(session: AgentSession, requested: SessionRequest, body: PostAgentSessionsBody): void {
    const { request, isTruncated } = sanitizeRequest(body);
    const policies = typeof requested.toolset === 'object' ? Object.values(requested.toolset) : [];
    const compiled = Object.values(session.compiledToolset);

    productTracking.track({
        name: 'agents:session_start',
        eventProperties: {
            ...sessionProperties(session),
            integration_count: compiled.length,
            is_tool_search_enabled: session.metaTools.nangoToolSearch,
            is_execute_enabled: session.metaTools.nangoExecute,
            is_proxy_enabled: session.metaTools.nangoProxy,
            is_create_connection_enabled: session.metaTools.nangoCreateConnection.enabled,
            pinned_tool_count: sum(compiled.map((integration) => integration.pinned.length)),
            searchable_tool_count: sum(compiled.map((integration) => integration.searchable.length)),
            toolset_mode: toolsetMode(requested.toolset),
            allowlisted_integration_count: policies.length,
            tool_allowlist_integration_count: policies.filter((policy) => policy.allow !== '*').length,
            tool_denylist_integration_count: policies.filter((policy) => policy.deny.length > 0).length,
            allowed_tool_count: sum(policies.map((policy) => (policy.allow === '*' ? 0 : policy.allow.length))),
            denied_tool_count: sum(policies.map((policy) => policy.deny.length)),
            connection_selector_count: requested.connections.any.length,
            pinned_connection_count: requested.connections.pinned.length,
            create_connection_tag_count: Object.keys(requested.metaTools?.nangoCreateConnection?.tags ?? {}).length,
            ...(requested.expiresInMs === undefined ? {} : { expires_in_ms: requested.expiresInMs }),
            request,
            is_request_truncated: isTruncated
        }
    });
}

/** Terminations only. An expired session ends with no request behind it, the same gap the logs have. */
export function trackAgentSessionTerminated(session: AgentSession): void {
    productTracking.track({
        name: 'agents:session_end',
        eventProperties: {
            ...sessionProperties(session),
            session_duration_ms: (session.endedAt ?? new Date()).getTime() - session.createdAt.getTime()
        }
    });
}

/**
 * Holds back the tool call events `call` emits until its result is built, so each one carries the size of
 * what the agent received and how long it waited for it.
 */
export async function measureAgentSessionToolCall(call: () => Promise<CallToolResult>): Promise<CallToolResult> {
    const startedAt = Date.now();
    const pending: MeasuredSend[] = [];
    let result: CallToolResult | undefined;

    try {
        result = await pendingToolCallEvents.run(pending, call);
        return result;
    } finally {
        const callDurationMs = Date.now() - startedAt;
        const measurement: ToolCallMeasurement = { ...(result ? resultSize(result) : {}), call_duration_ms: callDurationMs };
        for (const send of pending) {
            send(measurement);
        }
    }
}

export function trackAgentSessionToolCall({
    metaTool,
    session,
    integrationId,
    toolName,
    pinned,
    underlyingErrorCode,
    mcpTool,
    functionSource,
    goal,
    intent,
    ...outcome
}: ToolCallParams): void {
    sendMeasured((measurement) =>
        productTracking.track({
            name: 'agents:tool_call_complete',
            eventProperties: {
                ...sessionProperties(session),
                ...outcomeProperties(outcome),
                ...measurement,
                ...(toolName ? { tool_name: toolName } : {}),
                ...(metaTool ? { meta_tool: metaTool } : {}),
                ...(pinned === undefined ? {} : { is_pinned: pinned }),
                ...(integrationId ? { integration_id: integrationId } : {}),
                ...(underlyingErrorCode ? { underlying_error_code: underlyingErrorCode } : {}),
                ...(mcpTool ? { is_mcp_tool: true } : {}),
                ...(functionSource ? { function_source: functionSource === 'catalog' ? 'catalog' : 'custom' } : {}),
                ...(goal ? { goal } : {}),
                ...(intent ? { intent } : {})
            }
        })
    );
}

export function trackAgentSessionProxyRequest({
    session,
    integrationId,
    provider,
    method,
    path,
    status,
    providerErrorCode,
    goal,
    intent,
    ...outcome
}: ProxyRequestParams): void {
    sendMeasured((measurement) =>
        productTracking.track({
            name: 'agents:proxy_request_complete',
            eventProperties: {
                ...sessionProperties(session),
                meta_tool: 'nango_proxy',
                ...outcomeProperties(outcome),
                ...measurement,
                ...(integrationId ? { integration_id: integrationId } : {}),
                ...(method ? { http_method: method } : {}),
                ...(path ? { endpoint: path.split('?')[0] } : {}),
                ...(provider ? { provider } : {}),
                ...(status === undefined ? {} : { http_status: status }),
                ...(providerErrorCode ? { provider_error_code: providerErrorCode } : {}),
                ...(goal ? { goal } : {}),
                ...(intent ? { intent } : {})
            }
        })
    );
}

/**
 * Carries the query and the goal as the agent sent them, which is what search quality is measured against. The
 * results ride along so a query can be read next to what it returned, which is the exception the
 * taxonomy grants this event: everywhere else a property is a primitive.
 */
export function trackAgentSessionToolSearch({ session, query, goal, matches, related, ...outcome }: ToolSearchParams): void {
    sendMeasured((measurement) =>
        productTracking.track({
            name: 'agents:tool_search_complete',
            eventProperties: {
                ...sessionProperties(session),
                meta_tool: 'nango_tool_search',
                ...(query === undefined ? {} : { query }),
                ...(goal === undefined ? {} : { goal }),
                match_count: matches.length,
                related_count: related.length,
                ...(matches[0] ? { top_match_confidence: matches[0].confidence } : {}),
                ...outcomeProperties(outcome),
                ...measurement,
                matches,
                related
            }
        })
    );
}

function sanitizeRequest(body: PostAgentSessionsBody): { request: TrackedRequest; isTruncated: boolean } {
    let remaining = MAX_TRACKED_REQUEST_NAMES;
    let isTruncated = false;
    const take = <T>(items: T[]): T[] => {
        const kept = items.slice(0, remaining);
        isTruncated ||= kept.length < items.length;
        remaining -= kept.length;
        return kept;
    };
    const takeTools = (list: { tools: string[] }) => ({ tools: take(list.tools) });

    const { connections } = body.tenant;
    const { toolset, pinned_tools: pinnedTools, meta_tools: metaTools, expires_in: expiresIn } = body;
    const createConnection = metaTools?.nango_create_connection;

    const request: TrackedRequest = {
        tenant: {
            connections: {
                ...(connections.any && { any: connections.any.map((selector) => ({ tags: Object.keys(selector.tags) })) }),
                ...(connections.pinned && { pinned: take(connections.pinned).map((pin) => ({ integration_id: pin.integration_id })) })
            }
        },
        ...(toolset !== undefined && {
            toolset:
                toolset === '*'
                    ? toolset
                    : Object.fromEntries(
                          take(Object.entries(toolset)).map(([integrationId, policy]): [string, TrackedPolicy] => [
                              integrationId,
                              policy === '*'
                                  ? policy
                                  : {
                                        ...(policy.allow !== undefined && { allow: policy.allow === '*' ? policy.allow : takeTools(policy.allow) }),
                                        ...(policy.deny && { deny: takeTools(policy.deny) })
                                    }
                          ])
                      )
        }),
        ...(pinnedTools && {
            pinned_tools: Object.fromEntries(take(Object.entries(pinnedTools)).map(([integrationId, tools]) => [integrationId, take(tools)]))
        }),
        ...(metaTools && {
            meta_tools: {
                ...(metaTools.nango_tool_search !== undefined && { nango_tool_search: metaTools.nango_tool_search }),
                ...(metaTools.nango_execute !== undefined && { nango_execute: metaTools.nango_execute }),
                ...(metaTools.nango_proxy !== undefined && { nango_proxy: metaTools.nango_proxy }),
                ...(createConnection !== undefined && {
                    nango_create_connection:
                        typeof createConnection === 'boolean'
                            ? createConnection
                            : { enabled: createConnection.enabled, ...(createConnection.tags && { tags: Object.keys(createConnection.tags) }) }
                })
            }
        }),
        ...(expiresIn !== undefined && { expires_in: expiresIn })
    };

    return { request, isTruncated };
}

function toolsetMode(toolset: AgentSessionToolsetPolicy | undefined): AnalyticsEventProperties<'agents:session_start'>['toolset_mode'] {
    if (toolset === undefined) {
        return 'connected';
    }
    return toolset === '*' ? 'all' : 'allowlist';
}

function sum(counts: number[]): number {
    return counts.reduce((total, count) => total + count, 0);
}

function sessionProperties(session: AgentSession): { agent_session_id: string; is_playground: boolean } {
    return { agent_session_id: session.id, is_playground: isPlaygroundSession(session) };
}

/** One event per call, so whether it worked is a property and the code says why it did not. */
function outcomeProperties({ logOperationId, errorCode }: Outcome): { is_success: boolean; log_operation_id?: string; error_code?: string } {
    return {
        is_success: !errorCode,
        ...(logOperationId ? { log_operation_id: logOperationId } : {}),
        ...(errorCode ? { error_code: errorCode } : {})
    };
}

/** Outside a measured tool call, nothing holds the event back and it goes out without a measurement. */
function sendMeasured(send: MeasuredSend): void {
    const pending = pendingToolCallEvents.getStore();
    if (pending) {
        pending.push(send);
        return;
    }
    send({});
}

/** A client reads either content or structuredContent, never both, so the larger of the two is what the agent can receive. */
function resultSize({ content, structuredContent }: CallToolResult): Pick<ToolCallMeasurement, 'result_size_bytes' | 'result_token_estimate'> {
    const contentBytes = content.reduce((total, block) => total + Buffer.byteLength(block.type === 'text' ? block.text : JSON.stringify(block)), 0);
    const structuredBytes = structuredContent ? Buffer.byteLength(JSON.stringify(structuredContent)) : 0;
    const bytes = Math.max(contentBytes, structuredBytes);
    return { result_size_bytes: bytes, result_token_estimate: Math.ceil(bytes / BYTES_PER_TOKEN) };
}
