import { productTracking } from '@nangohq/shared';

import type { AgentSession, HTTP_METHOD } from '@nangohq/types';

/** The two ways a session runs one of its own tools. A pinned tool is called by its own name, not through nango_execute. */
export type AgentSessionToolCallEvent = 'nango_execute' | 'execute_pinned_tool';

type AgentSessionEvent = AgentSessionToolCallEvent | 'session_created' | 'session_terminated' | 'nango_proxy';

interface Outcome {
    logOperationId?: string | undefined;
    errorCode?: string | undefined;
}

interface ToolCallParams extends Outcome {
    event: AgentSessionToolCallEvent;
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
 * Account, environment, is-prod and plan are stamped by the tracking context middleware, so nothing
 * here passes them. No tool input and no provider response is sent, on purpose.
 */
export function trackAgentSessionCreated(session: AgentSession): void {
    trackSessionEvent('session_created', session, {
        'integration-count': Object.keys(session.compiledToolset).length,
        'tool-search-enabled': session.metaTools.nangoToolSearch,
        'execute-enabled': session.metaTools.nangoExecute,
        'proxy-enabled': session.metaTools.nangoProxy
    });
}

/** Terminations only. An expired session ends with no request behind it, the same gap the logs have. */
export function trackAgentSessionTerminated(session: AgentSession): void {
    trackSessionEvent('session_terminated', session, {
        'session-duration-ms': (session.endedAt ?? new Date()).getTime() - session.createdAt.getTime()
    });
}

export function trackAgentSessionToolCall({ event, session, integrationId, toolName, pinned, underlyingErrorCode, ...outcome }: ToolCallParams): void {
    trackSessionEvent(event, session, {
        'tool-name': toolName,
        ...outcomeProperties(outcome),
        ...(pinned === undefined ? {} : { pinned }),
        ...(integrationId ? { 'integration-id': integrationId } : {}),
        ...(underlyingErrorCode ? { 'underlying-error-code': underlyingErrorCode } : {})
    });
}

export function trackAgentSessionProxyRequest({ session, integrationId, provider, method, status, providerErrorCode, ...outcome }: ProxyRequestParams): void {
    trackSessionEvent('nango_proxy', session, {
        'integration-id': integrationId,
        'http-method': method,
        ...outcomeProperties(outcome),
        ...(provider ? { provider } : {}),
        ...(status === undefined ? {} : { 'http-status': status }),
        ...(providerErrorCode ? { 'provider-error-code': providerErrorCode } : {})
    });
}

/** Every session event carries the session it belongs to. */
function trackSessionEvent(name: AgentSessionEvent, session: AgentSession, properties: Record<string, unknown>): void {
    productTracking.track({ name, eventProperties: { 'session-id': session.id, ...properties } });
}

/** Every session event that can fail reports the failure the same way. */
function outcomeProperties({ logOperationId, errorCode }: Outcome): Record<string, unknown> {
    return {
        success: !errorCode,
        ...(logOperationId ? { 'log-operation-id': logOperationId } : {}),
        ...(errorCode ? { 'error-code': errorCode } : {})
    };
}
