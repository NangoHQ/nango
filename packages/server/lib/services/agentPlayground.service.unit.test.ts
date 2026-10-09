import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { generateText, stepCountIs } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { seeders } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { createAgentSessionMcpServer } from '../controllers/agent/mcp/sessionServer.js';
import {
    buildMcpTools,
    existingIntegrationFor,
    isSessionCurrent,
    newestConnectionPerIntegration,
    playgroundConnectionTags,
    sessionOwner,
    toolNeedsApproval
} from './agentPlayground.service.js';

import type { AgentSession } from '@nangohq/types';

const executeAction = vi.hoisted(() => vi.fn());
vi.mock('./action.service.js', () => ({ executeAction }));

const usage = {
    inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined }
};

function session(): AgentSession {
    return {
        id: 'session-1',
        environmentId: 1,
        accountId: 1,
        resolvedConnections: {
            notion: { integrationId: 'notion', provider: 'notion', connectionId: 'notion-acme', internalConnectionId: 10, configId: 20 }
        },
        compiledToolset: { notion: { provider: 'notion', pinned: [{ name: 'read_doc', description: 'Read a doc' }], searchable: [] } },
        metaTools: { nangoToolSearch: true, nangoExecute: true, nangoProxy: false, nangoCreateConnection: { enabled: false, tags: {} } },
        expiresAt: new Date(),
        endedAt: null,
        endedReason: null,
        createdAt: new Date(),
        updatedAt: new Date()
    };
}

describe('sessionOwner', () => {
    it('reads the user the session was created for', () => {
        const metaTools = { ...session().metaTools, nangoCreateConnection: { enabled: true, tags: { 'nango/playground_user': 'user-a' } } };

        expect(sessionOwner({ metaTools })).toBe('user-a');
    });

    it('has no owner for a session the playground did not create', () => {
        expect(sessionOwner({ metaTools: { ...session().metaTools, nangoCreateConnection: { enabled: false, tags: {} } } })).toBeUndefined();
    });
});

describe('playgroundConnectionTags', () => {
    it("tags connections with the user as their end user, like the dashboard's", () => {
        expect(playgroundConnectionTags({ id: 42, uuid: 'user-a', email: 'Jane@Example.com', name: 'Jane Doe' })).toEqual({
            end_user_id: '42',
            end_user_email: 'Jane@Example.com',
            end_user_display_name: 'Jane Doe',
            origin: 'nango_agent_playground',
            'nango/playground_user': 'user-a'
        });
    });

    it('keeps the owner that sessionOwner reads', () => {
        const tags = playgroundConnectionTags({ id: 1, uuid: 'user-a', email: 'a@example.com', name: 'A' });
        const metaTools = { ...session().metaTools, nangoCreateConnection: { enabled: true, tags } };

        expect(sessionOwner({ metaTools })).toBe('user-a');
    });
});

describe('isSessionCurrent', () => {
    const pinned = [{ integrationId: 'notion', connectionId: 'notion-acme' }];

    it('matches the integrations and connections the session was created with', () => {
        expect(isSessionCurrent(session(), ['notion'], pinned)).toBe(true);
    });

    it('does not match once an integration was added or deleted', () => {
        expect(isSessionCurrent(session(), ['notion', 'github'], pinned)).toBe(false);
        expect(isSessionCurrent(session(), ['github'], pinned)).toBe(false);
    });

    it('does not match once the newest connection changed, was added or was deleted', () => {
        expect(isSessionCurrent(session(), ['notion'], [{ integrationId: 'notion', connectionId: 'notion-new' }])).toBe(false);
        expect(isSessionCurrent(session(), ['notion'], [...pinned, { integrationId: 'github', connectionId: 'github-1' }])).toBe(false);
        expect(isSessionCurrent(session(), ['notion'], [])).toBe(false);
    });
});

describe('toolNeedsApproval', () => {
    it.each([
        { toolName: 'nango_proxy', input: { method: 'GET' }, expected: false },
        { toolName: 'nango_proxy', input: { method: 'get' }, expected: false },
        { toolName: 'nango_proxy', input: { method: 'PUT' }, expected: true },
        { toolName: 'nango_proxy', input: {}, expected: true },
        { toolName: 'nango_execute', input: { tool: 'pg-google-calendar__list-events' }, expected: false },
        { toolName: 'nango_execute', input: { tool: 'pg-google-calendar__get-event' }, expected: false },
        { toolName: 'nango_execute', input: { tool: 'pg-github__get_issue' }, expected: false },
        { toolName: 'nango_execute', input: { tool: 'pg-github__listen-for-events' }, expected: true },
        { toolName: 'nango_execute', input: { tool: 'pg-google-calendar__clear-calendar' }, expected: true },
        { toolName: 'nango_execute', input: { tool: 'pg-google-calendar__create-all-day-event' }, expected: true },
        { toolName: 'nango_execute', input: {}, expected: true },
        { toolName: 'pg-google-calendar__delete-event', input: {}, expected: true },
        { toolName: 'pg-google-calendar__search-events', input: {}, expected: false },
        { toolName: 'pg-slack__lookup-user-by-email', input: {}, expected: false },
        { toolName: 'pg-notion__query-database', input: {}, expected: false },
        { toolName: 'pg-notion__search', input: {}, expected: false },
        { toolName: 'pg-hubspot__whoami', input: {}, expected: false },
        { toolName: 'pg-google-docs__export-document', input: {}, expected: false },
        { toolName: 'pg-slack__post-message', input: {}, expected: true },
        { toolName: 'pg-slack__open-dm', input: {}, expected: true },
        { toolName: 'nango_tool_search', input: { query: 'delete event' }, expected: false },
        { toolName: 'nango_create_connection', input: {}, expected: false }
    ])('$toolName $input → $expected', ({ toolName, input, expected }) => {
        expect(toolNeedsApproval(toolName, input)).toBe(expected);
    });
});

describe('existingIntegrationFor', () => {
    it('prefers the playground integration, then the one keyed by the provider name, then the oldest', () => {
        const integrations = [
            { unique_key: 'slack', provider: 'slack', missing_fields: [] },
            { unique_key: 'pg-slack', provider: 'slack', missing_fields: [] },
            { unique_key: 'old-calendar', provider: 'google-calendar', missing_fields: [] },
            { unique_key: 'google-calendar', provider: 'google-calendar', missing_fields: [] },
            { unique_key: 'new-github', provider: 'github', missing_fields: [] },
            { unique_key: 'newer-github', provider: 'github', missing_fields: [] }
        ];

        expect(existingIntegrationFor(integrations, 'slack')?.unique_key).toBe('pg-slack');
        expect(existingIntegrationFor(integrations, 'google-calendar')?.unique_key).toBe('google-calendar');
        expect(existingIntegrationFor(integrations, 'github')?.unique_key).toBe('new-github');
        expect(existingIntegrationFor(integrations, 'linear')).toBeUndefined();
    });

    it('prefers a complete integration, and falls back to an incomplete one', () => {
        const integrations = [
            { unique_key: 'slack', provider: 'slack', missing_fields: ['oauth_client_secret'] },
            { unique_key: 'slack-prod', provider: 'slack', missing_fields: [] },
            { unique_key: 'linear', provider: 'linear', missing_fields: ['oauth_client_id'] }
        ];

        expect(existingIntegrationFor(integrations, 'slack')?.unique_key).toBe('slack-prod');
        expect(existingIntegrationFor(integrations, 'linear')?.unique_key).toBe('linear');
    });
});

describe('newestConnectionPerIntegration', () => {
    it('keeps the first connection listed for each integration', () => {
        const connections = [
            { connection: { provider_config_key: 'notion', connection_id: 'newest-notion' } },
            { connection: { provider_config_key: 'slack', connection_id: 'only-slack' } },
            { connection: { provider_config_key: 'notion', connection_id: 'older-notion' } }
        ];

        expect(newestConnectionPerIntegration(connections)).toEqual([
            { integrationId: 'notion', connectionId: 'newest-notion' },
            { integrationId: 'slack', connectionId: 'only-slack' }
        ]);
    });
});

describe('buildMcpTools', () => {
    let client: Client;
    let close: (() => Promise<void>) | undefined;

    beforeEach(async () => {
        executeAction.mockReset().mockResolvedValue({ logCtx: undefined, result: Ok({ data: { title: 'Roadmap' } }) });

        const server = createAgentSessionMcpServer({
            account: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: null,
            session: session()
        });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        client = new Client({ name: 'test-client', version: '1.0.0' });
        close = async () => {
            await client.close();
            await server.close();
        };
        await server.connect(serverTransport);
        await client.connect(clientTransport);
    });

    afterEach(async () => {
        await close?.();
        close = undefined;
    });

    it('runs the tool the model calls through the session', async () => {
        const tools = await buildMcpTools(client);

        expect(Object.keys(tools)).toEqual(expect.arrayContaining(['nango_tool_search', 'nango_execute', 'notion__read_doc']));

        const model = new MockLanguageModelV4({
            doGenerate: ({ prompt }) =>
                Promise.resolve(
                    prompt.at(-1)?.role === 'tool'
                        ? { content: [{ type: 'text', text: 'The doc is Roadmap' }], finishReason: { unified: 'stop', raw: undefined }, usage, warnings: [] }
                        : {
                              content: [{ type: 'tool-call', toolCallId: 'call-1', toolName: 'notion__read_doc', input: JSON.stringify({ id: 'doc-1' }) }],
                              finishReason: { unified: 'tool-calls', raw: undefined },
                              usage,
                              warnings: []
                          }
                )
        });

        const result = await generateText({ model, prompt: 'Read my doc', tools, stopWhen: stepCountIs(5) });

        expect(result.text).toBe('The doc is Roadmap');
        expect(executeAction).toHaveBeenCalledWith(expect.objectContaining({ actionName: 'read_doc', input: { id: 'doc-1' } }));
        expect(result.steps[0]?.toolResults).toEqual([expect.objectContaining({ toolCallId: 'call-1', output: { title: 'Roadmap' } })]);
    });

    it('turns a failed tool call into a tool error the model can see', async () => {
        executeAction.mockResolvedValue({ logCtx: undefined, result: Err(new Error('boom')) });
        const tools = await buildMcpTools(client);

        const model = new MockLanguageModelV4({
            doGenerate: ({ prompt }) =>
                Promise.resolve(
                    prompt.at(-1)?.role === 'tool'
                        ? { content: [{ type: 'text', text: 'It failed' }], finishReason: { unified: 'stop', raw: undefined }, usage, warnings: [] }
                        : {
                              content: [{ type: 'tool-call', toolCallId: 'call-1', toolName: 'notion__read_doc', input: JSON.stringify({ id: 'doc-1' }) }],
                              finishReason: { unified: 'tool-calls', raw: undefined },
                              usage,
                              warnings: []
                          }
                )
        });

        const result = await generateText({ model, prompt: 'Read my doc', tools, stopWhen: stepCountIs(5) });

        expect(result.steps[0]?.content).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'tool-error', toolCallId: 'call-1' })]));
    });
});
