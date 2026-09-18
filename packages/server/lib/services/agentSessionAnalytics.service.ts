import { productTracking } from '@nangohq/shared';

import type { ProductTrackingTypes } from '@nangohq/shared';
import type { AgentSession, HTTP_METHOD } from '@nangohq/types';

/** Nango's own tools, as opposed to the integration tools an account deploys. */
export type AgentSessionMetaTool = 'nango_execute' | 'nango_proxy' | 'nango_tool_search' | 'nango_create_connection';

/** One ranked tool, as the search returned it. Confidence runs from 0, nothing matched, to 1. */
export interface AgentSessionToolSearchHit {
    tool: string;
    /** The name the agent was given for it, which collisions make impossible to derive afterwards. */
    slug: string;
    integration: string;
    confidence: number;
}

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
}

interface ToolSearchParams extends Outcome {
    session: AgentSession;
    query: string;
    matches: AgentSessionToolSearchHit[];
    related: AgentSessionToolSearchHit[];
}

interface ProxyRequestParams extends Outcome {
    session: AgentSession;
    integrationId?: string | undefined;
    method?: HTTP_METHOD | undefined;
    provider?: string | undefined;
    status?: number | undefined;
    /** The provider's own error code, when the failure carried one. */
    providerErrorCode?: string | undefined;
}

/**
 * The account, the environment as is_production and the surface are stamped by the tracking context
 * middleware, so nothing here passes them. No tool input and no provider response is sent, on purpose.
 */
export function trackAgentSessionCreated(session: AgentSession): void {
    trackSessionEvent('agents:session_start', session, {
        integration_count: Object.keys(session.compiledToolset).length,
        is_tool_search_enabled: session.metaTools.nangoToolSearch,
        is_execute_enabled: session.metaTools.nangoExecute,
        is_proxy_enabled: session.metaTools.nangoProxy,
        is_create_connection_enabled: session.metaTools.nangoCreateConnection.enabled
    });
}

/** Terminations only. An expired session ends with no request behind it, the same gap the logs have. */
export function trackAgentSessionTerminated(session: AgentSession): void {
    trackSessionEvent('agents:session_end', session, {
        session_duration_ms: (session.endedAt ?? new Date()).getTime() - session.createdAt.getTime()
    });
}

export function trackAgentSessionToolCall({ metaTool, session, integrationId, toolName, pinned, underlyingErrorCode, ...outcome }: ToolCallParams): void {
    trackSessionEvent('agents:tool_call_complete', session, {
        ...outcomeProperties(outcome),
        ...(toolName ? { tool_name: toolName } : {}),
        ...(metaTool ? { meta_tool: metaTool } : {}),
        ...(pinned === undefined ? {} : { is_pinned: pinned }),
        ...(integrationId ? { integration_id: integrationId } : {}),
        ...(underlyingErrorCode ? { underlying_error_code: underlyingErrorCode } : {})
    });
}

export function trackAgentSessionProxyRequest({ session, integrationId, provider, method, status, providerErrorCode, ...outcome }: ProxyRequestParams): void {
    trackSessionEvent('agents:proxy_request_complete', session, {
        meta_tool: 'nango_proxy',
        ...outcomeProperties(outcome),
        ...(integrationId ? { integration_id: integrationId } : {}),
        ...(method ? { http_method: method } : {}),
        ...(provider ? { provider } : {}),
        ...(status === undefined ? {} : { http_status: status }),
        ...(providerErrorCode ? { provider_error_code: providerErrorCode } : {})
    });
}

/**
 * Carries the query as the agent sent it, which is what search quality is measured against. The
 * results ride along so a query can be read next to what it returned, which is the exception the
 * taxonomy grants this event: everywhere else a property is a primitive.
 */
export function trackAgentSessionToolSearch({ session, query, matches, related, ...outcome }: ToolSearchParams): void {
    productTracking.track({
        name: 'agents:tool_search_submit',
        eventProperties: {
            agent_session_id: session.id,
            query,
            match_count: matches.length,
            related_count: related.length,
            ...outcomeProperties(outcome)
        },
        structuredProperties: { matches, related }
    });
}

/** Every session event carries the session it belongs to. */
function trackSessionEvent(name: ProductTrackingTypes, session: AgentSession, properties: Record<string, string | number | boolean>): void {
    productTracking.track({ name, eventProperties: { agent_session_id: session.id, ...properties } });
}

/** One event per call, so whether it worked is a property and the code says why it did not. */
function outcomeProperties({ logOperationId, errorCode }: Outcome): Record<string, string | boolean> {
    return {
        is_success: !errorCode,
        ...(logOperationId ? { log_operation_id: logOperationId } : {}),
        ...(errorCode ? { error_code: errorCode } : {})
    };
}
