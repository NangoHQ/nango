import { productTracking } from '@nangohq/shared';

import type { ProductTrackingTypes } from '@nangohq/shared';
import type { AgentSession, HTTP_METHOD } from '@nangohq/types';

/** The two ways a session runs one of its own tools. A pinned tool is called by its own name, not through nango_execute. */
export type AgentSessionMetaTool = 'nango_execute' | 'execute_pinned_tool';

interface Outcome {
    logOperationId?: string | undefined;
    errorCode?: string | undefined;
}

interface ToolCallParams extends Outcome {
    metaTool: AgentSessionMetaTool;
    session: AgentSession;
    /** Unset when the call named a tool the session could not resolve to an integration. */
    integrationId?: string | undefined;
    toolName: string;
    /** Pinned tools are listed, searchable ones answer to their name without being listed. Both are callable directly. */
    pinned?: boolean | undefined;
    /** Names the underlying failure when the action ran and failed, rather than being rejected before it ran. */
    underlyingErrorCode?: string | undefined;
}

interface ProxyRequestParams extends Outcome {
    session: AgentSession;
    integrationId: string;
    provider?: string | undefined;
    method: HTTP_METHOD;
    status?: number | undefined;
    /** The provider's own error code, when the failure carried one. */
    providerErrorCode?: string | undefined;
}

/**
 * The account, the environment as is_prod and the surface are stamped by the tracking context
 * middleware, so nothing here passes them. No tool input and no provider response is sent, on purpose.
 */
export function trackAgentSessionCreated(session: AgentSession): void {
    trackSessionEvent('agents:session_create', session, {
        integration_count: Object.keys(session.compiledToolset).length,
        is_tool_search_enabled: session.metaTools.nangoToolSearch,
        is_execute_enabled: session.metaTools.nangoExecute,
        is_proxy_enabled: session.metaTools.nangoProxy
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
        meta_tool: metaTool,
        tool_name: toolName,
        ...outcomeProperties(outcome),
        ...(pinned === undefined ? {} : { is_pinned: pinned }),
        ...(integrationId ? { integration_id: integrationId } : {}),
        ...(underlyingErrorCode ? { underlying_error_code: underlyingErrorCode } : {})
    });
}

export function trackAgentSessionProxyRequest({ session, integrationId, provider, method, status, providerErrorCode, ...outcome }: ProxyRequestParams): void {
    trackSessionEvent('agents:proxy_request_complete', session, {
        integration_id: integrationId,
        http_method: method,
        ...outcomeProperties(outcome),
        ...(provider ? { provider } : {}),
        ...(status === undefined ? {} : { http_status: status }),
        ...(providerErrorCode ? { provider_error_code: providerErrorCode } : {})
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
