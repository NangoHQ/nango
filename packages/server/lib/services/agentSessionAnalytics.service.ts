import { productTracking } from '@nangohq/shared';

import type { AgentSession, HTTP_METHOD } from '@nangohq/types';

/** The two ways a session runs one of its own tools. A pinned tool is called by its own name, not through nango_execute. */
export type AgentSessionToolCallEvent = 'nango_execute' | 'execute_pinned_tool';

interface ToolCallParams {
    event: AgentSessionToolCallEvent;
    session: AgentSession;
    /** Unset when the call named a tool the session could not resolve to an integration. */
    integrationId?: string | undefined;
    toolName: string;
    /** Pinned tools are listed, searchable ones answer to their name without being listed. Both are callable directly. */
    pinned?: boolean | undefined;
    logOperationId?: string | undefined;
    errorCode?: string | undefined;
    /** Names the underlying failure when the action ran and failed, rather than being rejected before it ran. */
    underlyingErrorCode?: string | undefined;
}

interface ProxyRequestParams {
    session: AgentSession;
    integrationId: string;
    provider?: string | undefined;
    method: HTTP_METHOD;
    logOperationId?: string | undefined;
    status?: number | undefined;
    errorCode?: string | undefined;
    /** The provider's own error code, when the failure carried one. */
    providerErrorCode?: string | undefined;
}

/**
 * Account, environment, is-prod and plan are stamped by the tracking context middleware, so nothing
 * here passes them. No tool input and no provider response is sent, on purpose.
 */
export function trackAgentSessionCreated(session: AgentSession): void {
    productTracking.track({
        name: 'session_created',
        eventProperties: {
            'session-id': session.id,
            'integration-count': Object.keys(session.compiledToolset).length,
            'tool-search-enabled': session.metaTools.nangoToolSearch,
            'execute-enabled': session.metaTools.nangoExecute,
            'proxy-enabled': session.metaTools.nangoProxy
        }
    });
}

/** Terminations only. An expired session ends with no request behind it, the same gap the logs have. */
export function trackAgentSessionTerminated(session: AgentSession): void {
    productTracking.track({
        name: 'session_terminated',
        eventProperties: {
            'session-id': session.id,
            'session-duration-ms': (session.endedAt ?? new Date()).getTime() - session.createdAt.getTime()
        }
    });
}

export function trackAgentSessionToolCall({
    event,
    session,
    integrationId,
    toolName,
    pinned,
    logOperationId,
    errorCode,
    underlyingErrorCode
}: ToolCallParams): void {
    productTracking.track({
        name: event,
        eventProperties: {
            'session-id': session.id,
            'tool-name': toolName,
            success: !errorCode,
            ...(pinned === undefined ? {} : { pinned }),
            ...(integrationId ? { 'integration-id': integrationId } : {}),
            ...(logOperationId ? { 'log-operation-id': logOperationId } : {}),
            ...(errorCode ? { 'error-code': errorCode } : {}),
            ...(underlyingErrorCode ? { 'underlying-error-code': underlyingErrorCode } : {})
        }
    });
}

export function trackAgentSessionProxyRequest({
    session,
    integrationId,
    provider,
    method,
    logOperationId,
    status,
    errorCode,
    providerErrorCode
}: ProxyRequestParams): void {
    productTracking.track({
        name: 'nango_proxy',
        eventProperties: {
            'session-id': session.id,
            'integration-id': integrationId,
            'http-method': method,
            success: !errorCode,
            ...(provider ? { provider } : {}),
            ...(status === undefined ? {} : { 'http-status': status }),
            ...(logOperationId ? { 'log-operation-id': logOperationId } : {}),
            ...(errorCode ? { 'error-code': errorCode } : {}),
            ...(providerErrorCode ? { 'provider-error-code': providerErrorCode } : {})
        }
    });
}
