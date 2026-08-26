import { describe, expect, it } from 'vitest';

import { buildSessionTools, listSessionTools, TOOLS_PAGE_SIZE } from './sessionServer.js';

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
                inputSchema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: {}, additionalProperties: true },
                _meta: { 'nango/integration': 'discord', 'nango/tool': 'send_message' }
            },
            {
                name: 'slack__send_message',
                description: 'send_message description',
                inputSchema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: {}, additionalProperties: true },
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

    it('sanitises characters an integration id allows but a tool name does not', () => {
        const tools = listSessionTools(
            session({
                compiledToolset: {
                    'my notion.v2@acme': { provider: 'notion', pinned: [tool('read_doc')], searchable: [] }
                }
            })
        );

        expect(tools[2]!.name).toBe('my_notion_v2_acme__read_doc');
        expect(tools[2]!.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
        expect(tools[2]!._meta).toStrictEqual({ 'nango/integration': 'my notion.v2@acme', 'nango/tool': 'read_doc' });
    });

    it('keeps every name within the 64 character tool name limit', () => {
        const tools = listSessionTools(
            session({
                compiledToolset: {
                    ['a'.repeat(200)]: { provider: 'notion', pinned: [tool('b'.repeat(200))], searchable: [] }
                }
            })
        );

        for (const listed of tools) {
            expect(listed.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
        }
    });

    it('numbers a name two different tools would otherwise share', () => {
        const tools = listSessionTools(
            session({
                compiledToolset: {
                    // Both sanitise to `a_b__c`, which is exactly the collision the separator cannot prevent.
                    'a.b': { provider: 'notion', pinned: [tool('c')], searchable: [] },
                    a_b: { provider: 'notion', pinned: [tool('c')], searchable: [] }
                }
            })
        );

        expect(tools.slice(2).map((tool) => tool.name)).toStrictEqual(['a_b__c', 'a_b__c_2']);
        expect(new Set(tools.map((tool) => tool.name)).size).toBe(tools.length);
    });

    it('never lets a pinned tool take a meta tool name', () => {
        const tools = listSessionTools(
            session({
                compiledToolset: {
                    nango: { provider: 'notion', pinned: [tool('execute')], searchable: [] }
                }
            })
        );

        expect(tools.filter((tool) => tool.name === 'nango_execute')).toHaveLength(1);
        expect(tools[0]!.name).toBe('nango_tool_search');
        expect(tools[1]!.name).toBe('nango_execute');
    });

    it('makes searchable tools callable by name without listing them', () => {
        const { listed, callable } = buildSessionTools(
            session({
                compiledToolset: {
                    notion: { provider: 'notion', pinned: [tool('read_doc')], searchable: [tool('upsert_doc')] }
                }
            })
        );

        expect(listed.map((tool) => tool.name)).not.toContain('notion__upsert_doc');
        expect(callable.get('notion__upsert_doc')).toStrictEqual({ integrationId: 'notion', name: 'upsert_doc', description: 'upsert_doc description' });
        expect(callable.get('notion__read_doc')).toStrictEqual({ integrationId: 'notion', name: 'read_doc', description: 'read_doc description' });
    });

    it('never lets a searchable tool take a name a listed tool already answers to', () => {
        const { listed, callable } = buildSessionTools(
            session({
                compiledToolset: {
                    // Both sanitise to `a_b__c`, one pinned and so listed, one only searchable.
                    'a.b': { provider: 'notion', pinned: [tool('c')], searchable: [] },
                    a_b: { provider: 'notion', pinned: [], searchable: [tool('c')] }
                }
            })
        );

        expect(listed.map((tool) => tool.name)).toContain('a_b__c');
        expect(callable.get('a_b__c')).toStrictEqual({ integrationId: 'a.b', name: 'c', description: 'c description' });
        expect(callable.get('a_b__c_2')).toStrictEqual({ integrationId: 'a_b', name: 'c', description: 'c description' });
    });

    it('keeps a page worth of tools listable', () => {
        const pinned = Array.from({ length: TOOLS_PAGE_SIZE * 2 }, (_, index) => tool(`action_${index}`));
        const tools = listSessionTools(session({ compiledToolset: { notion: { provider: 'notion', pinned, searchable: [] } } }));

        expect(tools).toHaveLength(TOOLS_PAGE_SIZE * 2 + 2);
    });
});
