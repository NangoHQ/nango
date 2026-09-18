import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { productTracking, withProductTrackingContext } from '@nangohq/shared';

import {
    trackAgentSessionCreated,
    trackAgentSessionProxyRequest,
    trackAgentSessionTerminated,
    trackAgentSessionToolCall,
    trackAgentSessionToolSearch
} from './agentSessionAnalytics.service.js';

import type { AgentSession, DBEnvironment, DBTeam } from '@nangohq/types';

type Capture = (payload: { event: string; distinctId: string; properties: Record<string, unknown>; groups?: Record<string, string> }) => void;

const capture = vi.fn<Capture>();
const realClient = productTracking.client;

const session: AgentSession = {
    id: 'session-1',
    environmentId: 1,
    accountId: 1,
    resolvedConnections: {},
    compiledToolset: {
        notion: { provider: 'notion', pinned: [], searchable: [] },
        slack: { provider: 'slack', pinned: [], searchable: [] }
    },
    metaTools: { nangoToolSearch: true, nangoExecute: true, nangoProxy: false, nangoCreateConnection: { enabled: false, tags: {} } },
    expiresAt: new Date('2026-01-01T01:00:00Z'),
    endedAt: null,
    endedReason: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z')
};

/** These events carry no account of their own: the tracking context middleware is what stamps one. */
function inRequest(track: () => void): void {
    withProductTrackingContext(() => ({ team: { id: 42 } as DBTeam, environment: { is_production: true } as DBEnvironment }), track);
}

/** Asserts a single emit, so a double-emission regression fails rather than being read past. */
function onlyEvent() {
    expect(capture).toHaveBeenCalledTimes(1);
    return capture.mock.calls[0]![0];
}

beforeEach(() => {
    capture.mockClear();
    productTracking.client = { capture } as unknown as typeof productTracking.client;
});

afterEach(() => {
    productTracking.client = realClient;
});

describe('trackAgentSessionCreated', () => {
    it('reports the integration count and which meta tools the session runs with', () => {
        inRequest(() => trackAgentSessionCreated(session));

        const { event, properties } = onlyEvent();
        expect(event).toBe('agents:session_start');
        expect(properties).toMatchObject({
            agent_session_id: 'session-1',
            integration_count: 2,
            is_tool_search_enabled: true,
            is_execute_enabled: true,
            is_proxy_enabled: false,
            is_create_connection_enabled: false
        });
    });

    it('inherits the account and environment of the request', () => {
        inRequest(() => trackAgentSessionCreated(session));

        const { groups, properties } = onlyEvent();
        expect(groups).toStrictEqual({ company: '42' });
        expect(properties).toMatchObject({ is_production: true, surface: 'server' });
    });
});

describe('trackAgentSessionTerminated', () => {
    it('reports how long the session lived', () => {
        inRequest(() => trackAgentSessionTerminated({ ...session, endedAt: new Date('2026-01-01T00:10:00Z'), endedReason: 'terminated' }));

        const { event, properties } = onlyEvent();
        expect(event).toBe('agents:session_end');
        expect(properties).toMatchObject({ agent_session_id: 'session-1', session_duration_ms: 600_000 });
    });
});

describe('trackAgentSessionToolCall', () => {
    it('reports a call that worked, under the meta tool that ran it', () => {
        inRequest(() =>
            trackAgentSessionToolCall({
                metaTool: 'nango_execute',
                session,
                integrationId: 'notion',
                toolName: 'read_doc',
                logOperationId: 'op-1'
            })
        );

        const { event, properties } = onlyEvent();
        expect(event).toBe('agents:tool_call_complete');
        expect(properties).toMatchObject({
            agent_session_id: 'session-1',
            meta_tool: 'nango_execute',
            integration_id: 'notion',
            tool_name: 'read_doc',
            log_operation_id: 'op-1',
            is_success: true
        });
        expect(properties).not.toHaveProperty('error_code');
    });

    // A tool called by the name it is listed under goes through no meta tool of ours.
    // A meta tool that runs no integration tool of its own still reports as a call.
    it('reports a meta tool that runs no integration tool, like asking for a connect link', () => {
        inRequest(() => trackAgentSessionToolCall({ metaTool: 'nango_create_connection', session, integrationId: 'notion' }));

        const { event, properties } = onlyEvent();
        expect(event).toBe('agents:tool_call_complete');
        expect(properties).toMatchObject({ meta_tool: 'nango_create_connection', integration_id: 'notion', is_success: true });
        expect(properties).not.toHaveProperty('tool_name');
    });

    it('leaves the meta tool out when the agent called the tool by its own name', () => {
        inRequest(() => trackAgentSessionToolCall({ session, integrationId: 'notion', toolName: 'read_doc', pinned: true }));

        expect(onlyEvent().properties).not.toHaveProperty('meta_tool');
    });

    it('reports the failure and the underlying error code', () => {
        inRequest(() =>
            trackAgentSessionToolCall({
                metaTool: 'nango_execute',
                session,
                integrationId: 'notion',
                toolName: 'read_doc',
                logOperationId: 'op-1',
                errorCode: 'action_failed',
                underlyingErrorCode: 'action_script_failure'
            })
        );

        expect(onlyEvent().properties).toMatchObject({
            error_code: 'action_failed',
            underlying_error_code: 'action_script_failure'
        });
    });

    it('leaves the integration out when the call named a tool the session could not resolve', () => {
        inRequest(() => trackAgentSessionToolCall({ metaTool: 'nango_execute', session, toolName: 'made_up', errorCode: 'tool_not_in_session' }));

        const { properties } = onlyEvent();
        expect(properties).not.toHaveProperty('integration_id');
        expect(properties).not.toHaveProperty('log_operation_id');
        expect(properties).toMatchObject({ tool_name: 'made_up', error_code: 'tool_not_in_session' });
    });

    it.each([true, false])('separates a pinned tool from a searchable one called by its own name (pinned: %s)', (pinned) => {
        inRequest(() => trackAgentSessionToolCall({ session, integrationId: 'notion', toolName: 'read_doc', pinned }));

        expect(onlyEvent().properties).toMatchObject({ is_pinned: pinned });
    });

    it('leaves pinned out when the call site cannot say', () => {
        inRequest(() => trackAgentSessionToolCall({ metaTool: 'nango_execute', session, toolName: 'made_up', errorCode: 'tool_not_in_session' }));

        expect(onlyEvent().properties).not.toHaveProperty('is_pinned');
    });

    it('sends no tool input', () => {
        inRequest(() => trackAgentSessionToolCall({ metaTool: 'nango_execute', session, integrationId: 'notion', toolName: 'read_doc' }));

        expect(Object.keys(onlyEvent().properties)).not.toContain('input');
    });
});

describe('trackAgentSessionProxyRequest', () => {
    it('reports the provider, method and status of a successful request', () => {
        inRequest(() =>
            trackAgentSessionProxyRequest({
                session,
                integrationId: 'notion',
                provider: 'notion',
                method: 'GET',
                logOperationId: 'op-2',
                status: 200
            })
        );

        const { event, properties } = onlyEvent();
        expect(event).toBe('agents:proxy_request_complete');
        expect(properties).toMatchObject({
            agent_session_id: 'session-1',
            meta_tool: 'nango_proxy',
            integration_id: 'notion',
            provider: 'notion',
            http_method: 'GET',
            http_status: 200,
            log_operation_id: 'op-2',
            is_success: true
        });
    });

    it('reports the provider error code of a failed request', () => {
        inRequest(() =>
            trackAgentSessionProxyRequest({
                session,
                integrationId: 'notion',
                provider: 'notion',
                method: 'POST',
                status: 429,
                errorCode: 'upstream_error',
                providerErrorCode: 'rate_limited'
            })
        );

        expect(onlyEvent().properties).toMatchObject({
            http_status: 429,
            error_code: 'upstream_error',
            provider_error_code: 'rate_limited'
        });
    });

    it('reports a call rejected before its arguments could be read', () => {
        inRequest(() => trackAgentSessionProxyRequest({ session, errorCode: 'invalid_input' }));

        const { event, properties } = onlyEvent();
        expect(event).toBe('agents:proxy_request_complete');
        expect(properties).toMatchObject({ meta_tool: 'nango_proxy', is_success: false, error_code: 'invalid_input' });
        expect(properties).not.toHaveProperty('integration_id');
        expect(properties).not.toHaveProperty('http_method');
    });

    it('omits the status when the request never reached the provider', () => {
        inRequest(() => trackAgentSessionProxyRequest({ session, integrationId: 'notion', method: 'GET', errorCode: 'integration_not_connected' }));

        const { properties } = onlyEvent();
        expect(properties).not.toHaveProperty('http_status');
        expect(properties).not.toHaveProperty('provider');
        expect(properties).toMatchObject({ error_code: 'integration_not_connected' });
    });
});

describe('trackAgentSessionToolSearch', () => {
    const matches = [
        { tool: 'send_email', slug: 'gmail__send_email', integration: 'gmail', confidence: 0.82 },
        { tool: 'create_draft', slug: 'gmail__create_draft', integration: 'gmail', confidence: 0.61 }
    ];
    const related = [{ tool: 'create_ticket', slug: 'zendesk__create_ticket', integration: 'zendesk', confidence: 0.28 }];

    it('carries the query as sent, with both result tiers and their confidence', () => {
        inRequest(() => trackAgentSessionToolSearch({ session, query: 'email a customer', matches, related, logOperationId: 'op-3' }));

        const { event, properties } = onlyEvent();
        expect(event).toBe('agents:tool_search_complete');
        expect(properties).toMatchObject({
            agent_session_id: 'session-1',
            query: 'email a customer',
            match_count: 2,
            related_count: 1,
            matches,
            related,
            log_operation_id: 'op-3',
            is_success: true
        });
    });

    it('reports a search that failed', () => {
        inRequest(() => trackAgentSessionToolSearch({ session, query: 'email a customer', matches: [], related: [], errorCode: 'search_failed' }));

        expect(onlyEvent().properties).toMatchObject({ match_count: 0, related_count: 0, is_success: false, error_code: 'search_failed' });
    });
});
