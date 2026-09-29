import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { generateText, stepCountIs } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { seeders } from '@nangohq/shared';
import { Ok } from '@nangohq/utils';

import { createAgentSessionMcpServer } from '../controllers/agent/mcp/sessionServer.js';
import { buildMcpTools, pinNewestConnectionPerIntegration } from './agentPlayground.service.js';

import type { AgentPlaygroundToolCall, AgentSession } from '@nangohq/types';

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

    it('runs the tool the model calls through the session and records the call', async () => {
        const toolCalls: AgentPlaygroundToolCall[] = [];
        const tools = await buildMcpTools(client, toolCalls);

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
        expect(toolCalls).toEqual([
            expect.objectContaining({ id: 'call-1', name: 'notion__read_doc', input: { id: 'doc-1' }, output: { title: 'Roadmap' }, isError: false })
        ]);
    });
});
