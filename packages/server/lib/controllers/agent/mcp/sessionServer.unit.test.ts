import { describe, expect, it } from 'vitest';

import { listSessionTools, TOOLS_PAGE_SIZE } from './sessionServer.js';

import type { AgentSession, AgentSessionCompiledToolset, AgentSessionMetaTools } from '@nangohq/types';

function session({
    compiledToolset = {},
    metaTools = { nangoToolSearch: true, nangoExecute: true }
}: {
    compiledToolset?: AgentSessionCompiledToolset;
    metaTools?: AgentSessionMetaTools;
} = {}): AgentSession {
    return {
        id: 'session-1',
        environmentId: 1,
        accountId: 1,
        resolvedConnections: {},
        compiledToolset,
        metaTools,
        expiresAt: new Date(),
        endedAt: null,
        endedReason: null,
        createdAt: new Date(),
        updatedAt: new Date()
    };
}

function tool(name: string) {
    return { name, description: `${name} description` };
}

describe('listSessionTools', () => {
    it('lists the meta tools the session was created with', () => {
        expect(listSessionTools(session()).map((tool) => tool.name)).toStrictEqual(['nango_tool_search', 'nango_execute']);
        expect(listSessionTools(session({ metaTools: { nangoToolSearch: false, nangoExecute: true } })).map((tool) => tool.name)).toStrictEqual([
            'nango_execute'
        ]);
        expect(listSessionTools(session({ metaTools: { nangoToolSearch: false, nangoExecute: false } }))).toStrictEqual([]);
    });

    it('lists pinned tools and leaves searchable tools out', () => {
        const tools = listSessionTools(
            session({
                compiledToolset: {
                    notion: { provider: 'notion', pinned: [tool('read_doc')], searchable: [tool('upsert_doc')] }
                }
            })
        );

        expect(tools.map((tool) => tool.name)).toStrictEqual(['nango_tool_search', 'nango_execute', 'notion__read_doc']);
    });

    it('qualifies a pinned tool name by integration and carries both halves in _meta', () => {
        const tools = listSessionTools(
            session({
                compiledToolset: {
                    slack: { provider: 'slack', pinned: [tool('send_message')], searchable: [] },
                    discord: { provider: 'discord', pinned: [tool('send_message')], searchable: [] }
                }
            })
        );

        expect(tools.slice(2)).toStrictEqual([
            {
                name: 'discord__send_message',
                description: 'send_message description',
                inputSchema: { type: 'object', properties: {}, additionalProperties: true },
                _meta: { 'nango/integration': 'discord', 'nango/tool': 'send_message' }
            },
            {
                name: 'slack__send_message',
                description: 'send_message description',
                inputSchema: { type: 'object', properties: {}, additionalProperties: true },
                _meta: { 'nango/integration': 'slack', 'nango/tool': 'send_message' }
            }
        ]);
    });

    it('orders integrations by id so a cursor stays valid across list calls', () => {
        const toolset: AgentSessionCompiledToolset = {
            zendesk: { provider: 'zendesk', pinned: [tool('get_ticket')], searchable: [] },
            asana: { provider: 'asana', pinned: [tool('get_task')], searchable: [] }
        };

        expect(listSessionTools(session({ compiledToolset: toolset })).map((tool) => tool.name)).toStrictEqual(
            listSessionTools(session({ compiledToolset: { ...toolset } })).map((tool) => tool.name)
        );
        expect(listSessionTools(session({ compiledToolset: toolset })).map((tool) => tool.name)).toStrictEqual([
            'nango_tool_search',
            'nango_execute',
            'asana__get_task',
            'zendesk__get_ticket'
        ]);
    });

    it('does not list meta tools it does not ship', () => {
        expect(listSessionTools(session()).map((tool) => tool.name)).not.toContain('nango_proxy');
    });

    it('keeps a page worth of tools listable', () => {
        const pinned = Array.from({ length: TOOLS_PAGE_SIZE * 2 }, (_, index) => tool(`action_${index}`));
        const tools = listSessionTools(session({ compiledToolset: { notion: { provider: 'notion', pinned, searchable: [] } } }));

        expect(tools).toHaveLength(TOOLS_PAGE_SIZE * 2 + 2);
    });
});
