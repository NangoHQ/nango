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

type Capture = (payload: { event: string; distinctId: string; properties: Record<string, unknown> }) => void;

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
    metaTools: { nangoToolSearch: true, nangoExecute: true, nangoProxy: false },
    expiresAt: new Date('2026-01-01T01:00:00Z'),
    endedAt: null,
    endedReason: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z')
};

/** These events carry no account of their own: the tracking context middleware is what stamps one. */
function inRequest(track: () => void): void {
    withProductTrackingContext(
        () => ({ team: { id: 42, name: 'Acme' } as DBTeam, environment: { id: 7, name: 'prod', is_production: true } as DBEnvironment }),
        track
    );
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
        expect(event).toBe('session_created');
        expect(properties).toMatchObject({
            'session-id': 'session-1',
            'integration-count': 2,
            'tool-search-enabled': true,
            'execute-enabled': true,
            'proxy-enabled': false
        });
    });

    it('inherits the account and environment of the request', () => {
        inRequest(() => trackAgentSessionCreated(session));

        const { distinctId, properties } = onlyEvent();
        expect(distinctId).toBe('team-42');
        expect(properties).toMatchObject({ 'account-id': 42, 'environment-id': 7, 'is-prod': true });
    });
});

describe('trackAgentSessionTerminated', () => {
    it('reports how long the session lived', () => {
        inRequest(() => trackAgentSessionTerminated({ ...session, endedAt: new Date('2026-01-01T00:10:00Z'), endedReason: 'terminated' }));

        const { event, properties } = onlyEvent();
        expect(event).toBe('session_terminated');
        expect(properties).toMatchObject({ 'session-id': 'session-1', 'session-duration-ms': 600_000 });
    });
});

describe('trackAgentSessionToolCall', () => {
    it('reports a successful call under the event of the tool that ran it', () => {
        inRequest(() =>
            trackAgentSessionToolCall({
                event: 'execute_pinned_tool',
                session,
                integrationId: 'notion',
                toolName: 'read_doc',
                logOperationId: 'op-1'
            })
        );

        const { event, properties } = onlyEvent();
        expect(event).toBe('execute_pinned_tool');
        expect(properties).toMatchObject({
            'session-id': 'session-1',
            'integration-id': 'notion',
            'tool-name': 'read_doc',
            'log-operation-id': 'op-1',
            success: true
        });
        expect(properties).not.toHaveProperty('error-code');
    });

    it('reports the failure and the underlying error code', () => {
        inRequest(() =>
            trackAgentSessionToolCall({
                event: 'nango_execute',
                session,
                integrationId: 'notion',
                toolName: 'read_doc',
                logOperationId: 'op-1',
                errorCode: 'action_failed',
                underlyingErrorCode: 'action_script_failure'
            })
        );

        expect(onlyEvent().properties).toMatchObject({
            success: false,
            'error-code': 'action_failed',
            'underlying-error-code': 'action_script_failure'
        });
    });

    it('leaves the integration out when the call named a tool the session could not resolve', () => {
        inRequest(() => trackAgentSessionToolCall({ event: 'nango_execute', session, toolName: 'made_up', errorCode: 'unknown_tool' }));

        const { properties } = onlyEvent();
        expect(properties).not.toHaveProperty('integration-id');
        expect(properties).not.toHaveProperty('log-operation-id');
        expect(properties).toMatchObject({ 'tool-name': 'made_up', success: false, 'error-code': 'unknown_tool' });
    });

    it.each([true, false])('separates a pinned tool from a searchable one called by its own name (pinned: %s)', (pinned) => {
        inRequest(() => trackAgentSessionToolCall({ event: 'execute_pinned_tool', session, integrationId: 'notion', toolName: 'read_doc', pinned }));

        expect(onlyEvent().properties).toMatchObject({ pinned });
    });

    it('leaves pinned out when the call site cannot say', () => {
        inRequest(() => trackAgentSessionToolCall({ event: 'nango_execute', session, toolName: 'made_up', errorCode: 'unknown_tool' }));

        expect(onlyEvent().properties).not.toHaveProperty('pinned');
    });

    it('sends no tool input', () => {
        inRequest(() => trackAgentSessionToolCall({ event: 'nango_execute', session, integrationId: 'notion', toolName: 'read_doc' }));

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
        expect(event).toBe('nango_proxy');
        expect(properties).toMatchObject({
            'session-id': 'session-1',
            'integration-id': 'notion',
            provider: 'notion',
            'http-method': 'GET',
            'http-status': 200,
            'log-operation-id': 'op-2',
            success: true
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
                errorCode: 'proxy_request_failed',
                providerErrorCode: 'rate_limited'
            })
        );

        expect(onlyEvent().properties).toMatchObject({
            success: false,
            'http-status': 429,
            'error-code': 'proxy_request_failed',
            'provider-error-code': 'rate_limited'
        });
    });

    it('omits the status when the request never reached the provider', () => {
        inRequest(() => trackAgentSessionProxyRequest({ session, integrationId: 'notion', method: 'GET', errorCode: 'no_connection' }));

        const { properties } = onlyEvent();
        expect(properties).not.toHaveProperty('http-status');
        expect(properties).not.toHaveProperty('provider');
        expect(properties).toMatchObject({ success: false, 'error-code': 'no_connection' });
    });
});

describe('trackAgentSessionToolSearch', () => {
    const matches = [
        { tool: 'send_email', integration: 'gmail', confidence: 0.82 },
        { tool: 'create_draft', integration: 'gmail', confidence: 0.61 }
    ];
    const related = [{ tool: 'create_ticket', integration: 'zendesk', confidence: 0.28 }];

    it('carries the query as sent, with both result tiers and their confidence', () => {
        inRequest(() => trackAgentSessionToolSearch({ session, query: 'email a customer', matches, related, logOperationId: 'op-3' }));

        const { event, properties } = onlyEvent();
        expect(event).toBe('nango_tool_search');
        expect(properties).toMatchObject({
            'session-id': 'session-1',
            query: 'email a customer',
            'match-count': 2,
            'related-count': 1,
            matches,
            related,
            'log-operation-id': 'op-3',
            success: true
        });
    });

    it('reports a search that failed', () => {
        inRequest(() => trackAgentSessionToolSearch({ session, query: 'email a customer', matches: [], related: [], errorCode: 'search_failed' }));

        expect(onlyEvent().properties).toMatchObject({ 'match-count': 0, 'related-count': 0, success: false, 'error-code': 'search_failed' });
    });
});
