import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { productTracking, withProductTrackingContext } from '@nangohq/shared';

import { PLAYGROUND_USER_TAG_KEY } from './agentPlaygroundTags.js';
import {
    measureAgentSessionToolCall,
    trackAgentSessionCreated,
    trackAgentSessionProxyRequest,
    trackAgentSessionTerminated,
    trackAgentSessionToolCall,
    trackAgentSessionToolSearch
} from './agentSessionAnalytics.service.js';

import type { CallToolResult } from '@modelcontextprotocol/server';
import type { AgentSession, DBEnvironment, DBTeam, PostAgentSessionsBody } from '@nangohq/types';

type Capture = (payload: { event: string; distinctId: string; properties: Record<string, unknown>; groups?: Record<string, string> }) => void;

const capture = vi.fn<Capture>();
const realClient = productTracking.client;

const session: AgentSession = {
    id: 'session-1',
    environmentId: 1,
    accountId: 1,
    resolvedConnections: {},
    compiledToolset: {
        notion: { provider: 'notion', pinned: [{ name: 'create-page', description: '' }], searchable: [{ name: 'search', description: '' }] },
        slack: { provider: 'slack', pinned: [], searchable: [] }
    },
    metaTools: { nangoToolSearch: true, nangoExecute: true, nangoProxy: false, nangoCreateConnection: { enabled: false, tags: {} } },
    expiresAt: new Date('2026-01-01T01:00:00Z'),
    endedAt: null,
    endedReason: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z')
};

const requested = {
    connections: { any: [{ tags: { end_user_id: 'user-1' } }], pinned: [] },
    toolset: undefined,
    pinnedTools: undefined,
    metaTools: undefined,
    expiresInMs: undefined
};

const body: PostAgentSessionsBody = { tenant: { connections: { any: [{ tags: { end_user_id: 'user-1' } }] } } };

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
    vi.restoreAllMocks();
});

describe('trackAgentSessionCreated', () => {
    it('reports the integration count and which meta tools the session runs with', () => {
        inRequest(() => trackAgentSessionCreated(session, requested, body));

        const { event, properties } = onlyEvent();
        expect(event).toBe('agents:session_start');
        expect(properties).toMatchObject({
            agent_session_id: 'session-1',
            is_playground: false,
            integration_count: 2,
            is_tool_search_enabled: true,
            is_execute_enabled: true,
            is_proxy_enabled: false,
            is_create_connection_enabled: false
        });
    });

    it('reports a session that gets every connected integration', () => {
        inRequest(() => trackAgentSessionCreated(session, requested, body));

        const { properties } = onlyEvent();
        expect(properties).toMatchObject({
            toolset_mode: 'connected',
            allowlisted_integration_count: 0,
            tool_allowlist_integration_count: 0,
            tool_denylist_integration_count: 0,
            allowed_tool_count: 0,
            denied_tool_count: 0,
            pinned_tool_count: 1,
            searchable_tool_count: 1,
            connection_selector_count: 1,
            pinned_connection_count: 0,
            create_connection_tag_count: 0
        });
        expect(properties).not.toHaveProperty('expires_in_ms');
    });

    it('reports how the caller restricted the session, as counts', () => {
        inRequest(() =>
            trackAgentSessionCreated(
                session,
                {
                    connections: { any: [], pinned: [{ integrationId: 'notion', connectionId: 'conn-1' }] },
                    toolset: {
                        notion: { allow: ['create-page', 'search'], deny: [] },
                        slack: { allow: '*', deny: ['delete-message'] },
                        github: { allow: '*', deny: [] }
                    },
                    pinnedTools: { notion: ['create-page'] },
                    metaTools: { nangoCreateConnection: { enabled: true, tags: { end_user_id: 'user-1', team: 'a' } } },
                    expiresInMs: 3_600_000
                },
                body
            )
        );

        expect(onlyEvent().properties).toMatchObject({
            toolset_mode: 'allowlist',
            allowlisted_integration_count: 3,
            tool_allowlist_integration_count: 1,
            tool_denylist_integration_count: 1,
            allowed_tool_count: 2,
            denied_tool_count: 1,
            connection_selector_count: 0,
            pinned_connection_count: 1,
            create_connection_tag_count: 2,
            expires_in_ms: 3_600_000
        });
    });

    it('sends the request as posted, without tag values or connection ids', () => {
        inRequest(() =>
            trackAgentSessionCreated(session, requested, {
                tenant: {
                    connections: {
                        any: [{ tags: { end_user_id: 'user-1', end_user_email: 'a@example.com' } }],
                        pinned: [{ integration_id: 'notion', connection_id: 'conn-1' }]
                    }
                },
                toolset: { notion: { allow: { tools: ['create-page'] } }, slack: { deny: { tools: ['delete-message'] } }, github: '*' },
                pinned_tools: { notion: ['create-page'] },
                meta_tools: {
                    nango_proxy: true,
                    nango_execute: { enabled: false },
                    nango_create_connection: { enabled: true, tags: { end_user_id: 'user-1' } }
                },
                expires_in: '1h'
            })
        );

        expect(onlyEvent().properties).toMatchObject({
            is_request_truncated: false,
            request: {
                tenant: { connections: { any: [{ tags: ['end_user_id', 'end_user_email'] }], pinned: [{ integration_id: 'notion' }] } },
                toolset: { notion: { allow: { tools: ['create-page'] } }, slack: { deny: { tools: ['delete-message'] } }, github: '*' },
                pinned_tools: { notion: ['create-page'] },
                meta_tools: { nango_proxy: true, nango_execute: { enabled: false }, nango_create_connection: { enabled: true, tags: ['end_user_id'] } },
                expires_in: '1h'
            }
        });
        expect(JSON.stringify(onlyEvent().properties)).not.toMatch(/user-1|a@example\.com|conn-1/);
    });

    it('caps the names a request carries', () => {
        const tools = Array.from({ length: 300 }, (_, i) => `tool-${i}`);
        inRequest(() => trackAgentSessionCreated(session, requested, { ...body, toolset: { notion: { allow: { tools } } }, pinned_tools: { notion: tools } }));

        const { properties } = onlyEvent();
        expect(properties).toMatchObject({ is_request_truncated: true, request: { pinned_tools: {} } });
        expect((properties['request'] as { toolset: { notion: { allow: { tools: string[] } } } }).toolset.notion.allow.tools).toHaveLength(249);
    });

    it('reports a session open to every integration', () => {
        inRequest(() => trackAgentSessionCreated(session, { ...requested, toolset: '*' }, { ...body, toolset: '*' }));

        expect(onlyEvent().properties).toMatchObject({ toolset_mode: 'all', allowlisted_integration_count: 0 });
    });

    it('marks a session the Agent Playground created', () => {
        const playgroundSession: AgentSession = {
            ...session,
            metaTools: { ...session.metaTools, nangoCreateConnection: { enabled: true, tags: { [PLAYGROUND_USER_TAG_KEY]: 'user-a' } } }
        };
        inRequest(() => trackAgentSessionCreated(playgroundSession, requested, body));

        expect(onlyEvent().properties).toMatchObject({ agent_session_id: 'session-1', is_playground: true });
    });

    it('inherits the account and environment of the request', () => {
        inRequest(() => trackAgentSessionCreated(session, requested, body));

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

    it('carries the goal and the intent the agent gave', () => {
        inRequest(() =>
            trackAgentSessionToolCall({
                metaTool: 'nango_execute',
                session,
                integrationId: 'notion',
                toolName: 'read_doc',
                goal: 'summarize the roadmap doc',
                intent: 'read the roadmap doc'
            })
        );

        expect(onlyEvent().properties).toMatchObject({ goal: 'summarize the roadmap doc', intent: 'read the roadmap doc' });
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

    it('marks a tool that ran on an MCP server', () => {
        inRequest(() => trackAgentSessionToolCall({ session, integrationId: 'linear-mcp', toolName: 'list_issues', mcpTool: true }));

        expect(onlyEvent().properties).toMatchObject({ is_mcp_tool: true });
    });

    it('leaves the MCP marker off a deployed action', () => {
        inRequest(() => trackAgentSessionToolCall({ session, integrationId: 'notion', toolName: 'read_doc' }));

        expect(onlyEvent().properties).not.toHaveProperty('is_mcp_tool');
    });

    it.each([
        { functionSource: 'catalog', expected: 'catalog' },
        { functionSource: 'repo', expected: 'custom' },
        { functionSource: 'standalone', expected: 'custom' }
    ] as const)('reports a $functionSource function as $expected', ({ functionSource, expected }) => {
        inRequest(() => trackAgentSessionToolCall({ session, integrationId: 'notion', toolName: 'read_doc', functionSource }));

        expect(onlyEvent().properties).toMatchObject({ function_source: expected });
    });

    it('leaves the function source off for an MCP tool', () => {
        inRequest(() => trackAgentSessionToolCall({ session, integrationId: 'linear-mcp', toolName: 'list_issues', mcpTool: true }));

        expect(onlyEvent().properties).not.toHaveProperty('function_source');
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
                path: '/v1/pages/1?filter=archived',
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
            endpoint: '/v1/pages/1',
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

    it('carries the goal and the intent the agent gave', () => {
        inRequest(() =>
            trackAgentSessionProxyRequest({
                session,
                integrationId: 'notion',
                method: 'GET',
                status: 200,
                goal: 'find the roadmap doc',
                intent: 'no tool reads a page, a read page tool would'
            })
        );

        expect(onlyEvent().properties).toMatchObject({ goal: 'find the roadmap doc', intent: 'no tool reads a page, a read page tool would' });
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
        { tool_name: 'send_email', tool_slug: 'gmail__send_email', integration_id: 'gmail', confidence: 0.82 },
        { tool_name: 'create_draft', tool_slug: 'gmail__create_draft', integration_id: 'gmail', confidence: 0.61 }
    ];
    const related = [{ tool_name: 'create_ticket', tool_slug: 'zendesk__create_ticket', integration_id: 'zendesk', confidence: 0.28 }];

    it('carries the query and goal as sent, with both result tiers and their confidence', () => {
        inRequest(() =>
            trackAgentSessionToolSearch({
                session,
                query: 'email a customer',
                goal: 'reply to the customer about their refund',
                matches,
                related,
                logOperationId: 'op-3'
            })
        );

        const { event, properties } = onlyEvent();
        expect(event).toBe('agents:tool_search_complete');
        expect(properties).toMatchObject({
            agent_session_id: 'session-1',
            meta_tool: 'nango_tool_search',
            query: 'email a customer',
            goal: 'reply to the customer about their refund',
            match_count: 2,
            related_count: 1,
            top_match_confidence: 0.82,
            matches,
            related,
            log_operation_id: 'op-3',
            is_success: true
        });
    });

    it('reports a search rejected before its arguments could be read', () => {
        inRequest(() => trackAgentSessionToolSearch({ session, matches: [], related: [], errorCode: 'invalid_input' }));

        const { properties } = onlyEvent();
        expect(properties).not.toHaveProperty('query');
        expect(properties).toMatchObject({ is_success: false, error_code: 'invalid_input' });
    });

    it('reports a search that failed', () => {
        inRequest(() => trackAgentSessionToolSearch({ session, query: 'email a customer', matches: [], related: [], errorCode: 'search_failed' }));

        expect(onlyEvent().properties).toMatchObject({ match_count: 0, related_count: 0, is_success: false, error_code: 'search_failed' });
    });
});

describe('measureAgentSessionToolCall', () => {
    function measured(result: CallToolResult, track: () => void): Promise<CallToolResult> {
        return withProductTrackingContext(
            () => ({ team: { id: 42 } as DBTeam }),
            async () =>
                await measureAgentSessionToolCall(() => {
                    track();
                    return Promise.resolve(result);
                })
        );
    }

    it('holds the event until the result is built, then sends it with its size and duration', async () => {
        vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_250);
        const result: CallToolResult = { content: [{ type: 'text', text: 'a'.repeat(10) }] };

        await measured(result, () => {
            trackAgentSessionToolCall({ metaTool: 'nango_execute', session, integrationId: 'notion', toolName: 'read_doc' });
            expect(capture).not.toHaveBeenCalled();
        });

        expect(onlyEvent().properties).toMatchObject({ result_size_bytes: 10, result_token_estimate: 3, call_duration_ms: 250 });
    });

    it('counts bytes, not characters', async () => {
        await measured({ content: [{ type: 'text', text: 'é' }] }, () => trackAgentSessionToolCall({ session, integrationId: 'notion', toolName: 'read_doc' }));

        expect(onlyEvent().properties).toMatchObject({ result_size_bytes: 2, result_token_estimate: 1 });
    });

    it('counts a block that is not text as it is serialised', async () => {
        const image = { type: 'image' as const, data: 'aGVsbG8=', mimeType: 'image/png' };

        await measured({ content: [{ type: 'text', text: 'abcd' }, image] }, () =>
            trackAgentSessionToolCall({ session, integrationId: 'linear-mcp', toolName: 'screenshot', mcpTool: true })
        );

        expect(onlyEvent().properties).toMatchObject({ result_size_bytes: 4 + Buffer.byteLength(JSON.stringify(image)) });
    });

    it('counts structured content an MCP tool returned without text', async () => {
        const structuredContent = { rows: ['a'.repeat(100)] };

        await measured({ content: [], structuredContent }, () =>
            trackAgentSessionToolCall({ session, integrationId: 'linear-mcp', toolName: 'list', mcpTool: true })
        );

        expect(onlyEvent().properties).toMatchObject({ result_size_bytes: Buffer.byteLength(JSON.stringify(structuredContent)) });
    });

    it('counts structured content and its text copy once', async () => {
        const structuredContent = { id: 'abc' };
        const text = JSON.stringify(structuredContent, null, 2);

        await measured({ content: [{ type: 'text', text }], structuredContent }, () =>
            trackAgentSessionToolCall({ session, integrationId: 'notion', toolName: 'read_doc' })
        );

        expect(onlyEvent().properties).toMatchObject({ result_size_bytes: Buffer.byteLength(text) });
    });

    it('measures a failed call by the error the agent received', async () => {
        await measured({ content: [{ type: 'text', text: 'nope' }], isError: true }, () =>
            trackAgentSessionToolSearch({ session, matches: [], related: [], errorCode: 'invalid_input' })
        );

        expect(onlyEvent().properties).toMatchObject({ is_success: false, result_size_bytes: 4, result_token_estimate: 1 });
    });

    it('measures a proxy request', async () => {
        await measured({ content: [{ type: 'text', text: '{}' }] }, () =>
            trackAgentSessionProxyRequest({ session, integrationId: 'notion', method: 'GET', status: 200 })
        );

        const { event, properties } = onlyEvent();
        expect(event).toBe('agents:proxy_request_complete');
        expect(properties).toMatchObject({ result_size_bytes: 2, result_token_estimate: 1 });
        expect(properties).toHaveProperty('call_duration_ms');
    });

    it('still sends the duration when the call throws', async () => {
        await expect(
            withProductTrackingContext(
                () => ({ team: { id: 42 } as DBTeam }),
                async () =>
                    await measureAgentSessionToolCall(() => {
                        trackAgentSessionToolCall({ session, integrationId: 'notion', toolName: 'read_doc' });
                        return Promise.reject(new Error('boom'));
                    })
            )
        ).rejects.toThrow('boom');

        const { properties } = onlyEvent();
        expect(properties).toHaveProperty('call_duration_ms');
        expect(properties).not.toHaveProperty('result_size_bytes');
    });

    it('sends an event emitted outside a tool call right away, unmeasured', () => {
        inRequest(() => trackAgentSessionToolCall({ session, integrationId: 'notion', toolName: 'read_doc' }));

        const { properties } = onlyEvent();
        expect(properties).not.toHaveProperty('result_size_bytes');
        expect(properties).not.toHaveProperty('call_duration_ms');
    });
});
