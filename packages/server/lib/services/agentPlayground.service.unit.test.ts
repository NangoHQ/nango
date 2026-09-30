import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { generateText, stepCountIs } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { seeders } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { createAgentSessionMcpServer } from '../controllers/agent/mcp/sessionServer.js';
import { buildInstructions, buildMcpTools, pinNewestConnectionPerIntegration, toolNeedsApproval } from './agentPlayground.service.js';

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

describe('buildInstructions', () => {
    it("states the hour in the user's time zone", () => {
        const instructions = buildInstructions('Europe/Prague', new Date('2026-09-29T15:42:10Z'));

        expect(instructions).toContain("The user's time zone is Europe/Prague. It is currently Tuesday, 29 September 2026 at 17:00 there.");
    });

    it('names each integration by its id and says whether it is connected', () => {
        const instructions = buildInstructions('UTC', new Date('2026-09-29T15:00:00Z'), [
            { id: 'pg-github', provider: 'github', connected: false },
            { id: 'pg-google-calendar', provider: 'google-calendar', connected: true }
        ]);

        expect(instructions).toContain('- pg-github (github): not connected');
        expect(instructions).toContain('- pg-google-calendar (google-calendar): connected');
    });

    it('names the apps that could not be set up, and says nothing when all were', () => {
        const withMissing = buildInstructions('UTC', new Date('2026-09-29T15:00:00Z'), [], ['Google Calendar']);
        const withoutMissing = buildInstructions('UTC', new Date('2026-09-29T15:00:00Z'), [], []);

        expect(withMissing).toContain('These apps could not be set up in the playground right now: Google Calendar.');
        expect(withoutMissing).not.toContain('could not be set up');
    });

    it('is identical for two times within the same hour', () => {
        expect(buildInstructions('UTC', new Date('2026-09-29T15:01:00Z'))).toBe(buildInstructions('UTC', new Date('2026-09-29T15:59:00Z')));
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
        { toolName: 'nango_execute', input: { tool: 'pg-google-calendar__clear-calendar' }, expected: true },
        { toolName: 'nango_execute', input: { tool: 'pg-google-calendar__create-all-day-event' }, expected: true },
        { toolName: 'nango_execute', input: {}, expected: true },
        { toolName: 'pg-google-calendar__delete-event', input: {}, expected: true },
        { toolName: 'pg-google-calendar__search-events', input: {}, expected: false },
        { toolName: 'nango_tool_search', input: { query: 'delete event' }, expected: false },
        { toolName: 'nango_create_connection', input: {}, expected: false }
    ])('$toolName $input → $expected', ({ toolName, input, expected }) => {
        expect(toolNeedsApproval(toolName, input)).toBe(expected);
    });
});

describe('pinNewestConnectionPerIntegration', () => {
    it('keeps the first connection listed for each integration', () => {
        const rows = [
            { connection: { provider_config_key: 'notion', connection_id: 'newest-notion' } },
            { connection: { provider_config_key: 'slack', connection_id: 'only-slack' } },
            { connection: { provider_config_key: 'notion', connection_id: 'older-notion' } }
        ];

        expect(pinNewestConnectionPerIntegration(rows)).toEqual([
            { integrationId: 'notion', connectionId: 'newest-notion' },
            { integrationId: 'slack', connectionId: 'only-slack' }
        ]);
    });
});

describe('buildMcpTools', () => {
    let client: Client;
    let close: () => Promise<void>;

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
        await server.connect(serverTransport);
        await client.connect(clientTransport);
        close = async () => {
            await client.close();
            await server.close();
        };
    });

    afterEach(async () => {
        await close();
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
