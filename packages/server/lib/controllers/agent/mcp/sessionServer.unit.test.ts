import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { seeders, toolService } from '@nangohq/shared';
import { Ok } from '@nangohq/utils';

import { directCallInputSchema } from './directCallSchema.js';
import { actionInputSchemaOf, buildSessionTools, createAgentSessionMcpServer, listSessionTools, TOOLS_PAGE_SIZE } from './sessionServer.js';

import type * as ToolSearchService from '../../../services/agentSessionToolSearch.service.js';
import type { AgentSession, AgentSessionCompiledToolset, AgentSessionMetaTools, AgentSessionToolInput } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

const executeAction = vi.hoisted(() => vi.fn());
vi.mock('../../../services/action.service.js', () => ({ executeAction }));

const findActionInputs = vi.hoisted(() => vi.fn());
vi.mock('../../../services/agentSessionToolSearch.service.js', async (importOriginal) => ({
    ...(await importOriginal<typeof ToolSearchService>()),
    findActionInputs
}));

const DRAFT_07 = 'http://json-schema.org/draft-07/schema#';

const OPEN_INPUT_SCHEMA = directCallInputSchema(undefined);

function session({
    compiledToolset = {},
    resolvedConnections = {},
    metaTools = { nangoToolSearch: true, nangoExecute: true, nangoProxy: false, nangoCreateConnection: { enabled: false, tags: {} } }
}: {
    compiledToolset?: AgentSessionCompiledToolset;
    resolvedConnections?: AgentSession['resolvedConnections'];
    metaTools?: AgentSessionMetaTools;
} = {}): AgentSession {
    return {
        id: 'session-1',
        environmentId: 1,
        accountId: 1,
        resolvedConnections,
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

describe('createAgentSessionMcpServer', () => {
    beforeEach(() => {
        executeAction.mockReset().mockResolvedValue({ logCtx: undefined, result: Ok({ data: { ok: true } }) });
        findActionInputs.mockReset().mockResolvedValue(new Map());
        vi.spyOn(toolService, 'findTool').mockResolvedValue(Ok(null));
    });

    async function listTools(compiledToolset: AgentSessionCompiledToolset) {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const server = createAgentSessionMcpServer({
            account: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: null,
            session: session({ compiledToolset })
        });
        const client = new Client({ name: 'test-client', version: '1.0.0' });

        await server.connect(serverTransport);
        await client.connect(clientTransport);

        try {
            return (await client.listTools()).tools;
        } finally {
            await client.close();
            await server.close();
        }
    }

    it('lists a pinned deployed action with the input schema it was deployed with', async () => {
        const model = { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] };
        findActionInputs.mockResolvedValue(
            new Map([
                ['notion', new Map([['read_doc', { kind: 'schema', schema: { definitions: { ReadDocInput: model }, $ref: '#/definitions/ReadDocInput' } }]])]
            ])
        );

        const tools = await listTools({
            notion: { provider: 'notion', pinned: [tool('read_doc'), { ...tool('search'), mcp: { inputSchema: { type: 'object' } } }], searchable: [] }
        });

        expect(findActionInputs).toHaveBeenCalledWith({ environmentId: 1, actions: [{ integrationId: 'notion', name: 'read_doc' }] });
        expect(tools.find((listed) => listed.name === 'notion__read_doc')?.inputSchema).toMatchObject({
            properties: { input: { $ref: '#/definitions/ReadDocInput' } },
            definitions: { ReadDocInput: model }
        });
    });

    it('keeps the free-form schema for an action that is no longer deployed', async () => {
        const tools = await listTools({ notion: { provider: 'notion', pinned: [tool('read_doc')], searchable: [] } });

        expect(tools.find((listed) => listed.name === 'notion__read_doc')?.inputSchema).toStrictEqual(OPEN_INPUT_SCHEMA);
    });

    it('still lists tools when the schema lookup fails', async () => {
        findActionInputs.mockRejectedValue(new Error('db down'));

        const tools = await listTools({ notion: { provider: 'notion', pinned: [tool('read_doc')], searchable: [] } });

        expect(tools.find((listed) => listed.name === 'notion__read_doc')?.inputSchema).toStrictEqual(OPEN_INPUT_SCHEMA);
    });

    it('skips the lookup when no deployed action is listed', async () => {
        await listTools({ notion: { provider: 'notion', pinned: [], searchable: [tool('read_doc')] } });

        expect(findActionInputs).not.toHaveBeenCalled();
    });

    it('advertises that its tool list does not change during a connection', async () => {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const server = createAgentSessionMcpServer({
            account: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: null,
            session: session()
        });
        const client = new Client({ name: 'test-client', version: '1.0.0' });

        await server.connect(serverTransport);
        await client.connect(clientTransport);

        try {
            expect(client.getServerCapabilities()?.tools?.listChanged).toBe(false);
        } finally {
            await client.close();
            await server.close();
        }
    });

    it("sends the session's instructions on initialize", async () => {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const server = createAgentSessionMcpServer({
            account: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: null,
            session: session({ compiledToolset: { notion: { provider: 'notion', pinned: [], searchable: [tool('read_doc')] } } })
        });
        const client = new Client({ name: 'test-client', version: '1.0.0' });

        await server.connect(serverTransport);
        await client.connect(clientTransport);

        try {
            expect(client.getInstructions()).toContain('- notion (notion): not connected');
        } finally {
            await client.close();
            await server.close();
        }
    });

    it.each([
        { requestParams: { name: 'notion__read_doc' }, clientParams: { name: 'notion__read_doc' }, expectedInput: undefined },
        {
            requestParams: { name: 'notion__read_doc', arguments: {} },
            clientParams: { name: 'notion__read_doc', arguments: {} },
            expectedInput: {}
        }
    ])('uses the original direct-tool arguments before SDK normalization', async ({ requestParams, clientParams, expectedInput }) => {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const server = createAgentSessionMcpServer(
            {
                account: seeders.getTestTeam(),
                environment: seeders.getTestEnvironment(),
                plan: null,
                session: session({
                    compiledToolset: { notion: { provider: 'notion', pinned: [tool('read_doc')], searchable: [] } },
                    resolvedConnections: {
                        notion: {
                            integrationId: 'notion',
                            provider: 'notion',
                            connectionId: 'notion-acme',
                            internalConnectionId: 10,
                            configId: 20
                        }
                    }
                })
            },
            { jsonrpc: '2.0', id: 1, method: 'tools/call', params: requestParams }
        );
        const client = new Client({ name: 'test-client', version: '1.0.0' });

        await server.connect(serverTransport);
        await client.connect(clientTransport);

        try {
            await client.callTool(clientParams);
            expect(executeAction).toHaveBeenCalledWith(expect.objectContaining({ input: expectedInput }));
        } finally {
            await client.close();
            await server.close();
        }
    });
});

describe('direct tool calls', () => {
    const PURPOSE = { goal: 'summarize my roadmap doc', intent: 'read the roadmap doc' };

    beforeEach(() => {
        executeAction.mockReset().mockResolvedValue({ logCtx: undefined, result: Ok({ data: { ok: true } }) });
        vi.spyOn(toolService, 'findTool').mockResolvedValue(Ok(null));
    });

    async function callTool(args: Record<string, unknown>) {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const server = createAgentSessionMcpServer({
            account: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: null,
            session: session({
                compiledToolset: { notion: { provider: 'notion', pinned: [tool('read_doc')], searchable: [] } },
                resolvedConnections: {
                    notion: { integrationId: 'notion', provider: 'notion', connectionId: 'notion-acme', internalConnectionId: 10, configId: 20 }
                }
            })
        });
        const client = new Client({ name: 'test-client', version: '1.0.0' });

        await server.connect(serverTransport);
        await client.connect(clientTransport);

        try {
            return await client.callTool({ name: 'notion__read_doc', arguments: args });
        } finally {
            await client.close();
            await server.close();
        }
    }

    it('unwraps the input and records the goal and the intent', async () => {
        await callTool({ input: { id: 'doc-1' }, ...PURPOSE });

        expect(executeAction).toHaveBeenCalledWith(expect.objectContaining({ input: { id: 'doc-1' }, logMeta: PURPOSE }));
    });

    it('passes no input when a wrapped call leaves it out', async () => {
        await callTool(PURPOSE);

        expect(executeAction).toHaveBeenCalledWith(expect.objectContaining({ input: undefined, logMeta: PURPOSE }));
    });

    it('passes an input that is not an object', async () => {
        await callTool({ input: ['doc-1', 'doc-2'], ...PURPOSE });

        expect(executeAction).toHaveBeenCalledWith(expect.objectContaining({ input: ['doc-1', 'doc-2'] }));
    });

    it('still accepts the bare input of a session created before the wrapper', async () => {
        await callTool({ id: 'doc-1' });

        expect(executeAction).toHaveBeenCalledWith(expect.objectContaining({ input: { id: 'doc-1' }, logMeta: undefined }));
    });

    it("treats a tool's own goal field as its input when the intent is missing", async () => {
        await callTool({ goal: 'ship v2' });

        expect(executeAction).toHaveBeenCalledWith(expect.objectContaining({ input: { goal: 'ship v2' } }));
    });

    it('rejects a wrapped call with an empty intent', async () => {
        const result = await callTool({ input: { id: 'doc-1' }, goal: PURPOSE.goal, intent: ' ' });

        expect(result.isError).toBe(true);
        expect(JSON.stringify(result.content)).toContain('intent');
        expect(executeAction).not.toHaveBeenCalled();
    });
});

describe('listSessionTools', () => {
    it('lists the meta tools the session was created with', () => {
        expect(listSessionTools(session()).map((tool) => tool.name)).toStrictEqual(['nango_tool_search', 'nango_execute']);
        expect(
            listSessionTools(
                session({ metaTools: { nangoToolSearch: false, nangoExecute: true, nangoProxy: false, nangoCreateConnection: { enabled: false, tags: {} } } })
            ).map((tool) => tool.name)
        ).toStrictEqual(['nango_execute']);
        expect(
            listSessionTools(
                session({ metaTools: { nangoToolSearch: true, nangoExecute: true, nangoProxy: true, nangoCreateConnection: { enabled: false, tags: {} } } })
            ).map((tool) => tool.name)
        ).toStrictEqual(['nango_tool_search', 'nango_execute', 'nango_proxy']);
        expect(
            listSessionTools(
                session({ metaTools: { nangoToolSearch: true, nangoExecute: true, nangoProxy: false, nangoCreateConnection: { enabled: true, tags: {} } } })
            ).map((tool) => tool.name)
        ).toStrictEqual(['nango_tool_search', 'nango_execute', 'nango_create_connection']);
        expect(
            listSessionTools(
                session({ metaTools: { nangoToolSearch: false, nangoExecute: false, nangoProxy: false, nangoCreateConnection: { enabled: false, tags: {} } } })
            )
        ).toStrictEqual([]);
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
                inputSchema: OPEN_INPUT_SCHEMA,
                _meta: { 'nango/integration': 'discord', 'nango/tool': 'send_message' }
            },
            {
                name: 'slack__send_message',
                description: 'send_message description',
                inputSchema: OPEN_INPUT_SCHEMA,
                _meta: { 'nango/integration': 'slack', 'nango/tool': 'send_message' }
            }
        ]);
    });

    it('lists a pinned MCP server tool with the schema and annotations its server gave', () => {
        const inputSchema = { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] };
        const tools = listSessionTools(
            session({
                compiledToolset: {
                    'linear-mcp': {
                        provider: 'linear-mcp',
                        pinned: [{ name: 'list_issues', description: 'List issues', mcp: { inputSchema, annotations: { readOnlyHint: true } } }],
                        searchable: [],
                        mcpServer: 'available'
                    }
                }
            })
        );

        expect(tools.slice(2)).toStrictEqual([
            {
                name: 'linear-mcp__list_issues',
                description: 'List issues',
                inputSchema: directCallInputSchema(inputSchema),
                annotations: { readOnlyHint: true },
                _meta: { 'nango/integration': 'linear-mcp', 'nango/tool': 'list_issues' }
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

    it('keeps long names up to 64 characters', () => {
        const integrationId = 'i'.repeat(31);
        const toolName = 't'.repeat(31);
        const tools = listSessionTools(session({ compiledToolset: { [integrationId]: { provider: 'notion', pinned: [tool(toolName)], searchable: [] } } }));

        expect(tools[2]?.name).toBe(`${integrationId}__${toolName}`);
    });

    it('gives a short tool name the room a long integration id cannot have', () => {
        const tools = listSessionTools(session({ compiledToolset: { ['i'.repeat(100)]: { provider: 'notion', pinned: [tool('get_task')], searchable: [] } } }));

        expect(tools[2]?.name).toBe(`${'i'.repeat(54)}__get_task`);
    });

    it('gives a short integration id room for a long tool name', () => {
        const tools = listSessionTools(session({ compiledToolset: { asana: { provider: 'asana', pinned: [tool('t'.repeat(100))], searchable: [] } } }));

        expect(tools[2]?.name).toBe(`asana__${'t'.repeat(57)}`);
    });

    it('splits the room when both parts are long', () => {
        const tools = listSessionTools(
            session({ compiledToolset: { ['i'.repeat(100)]: { provider: 'notion', pinned: [tool('t'.repeat(100))], searchable: [] } } })
        );

        expect(tools[2]?.name).toBe(`${'i'.repeat(31)}__${'t'.repeat(31)}`);
    });

    it('numbers names that collide after clipping within 64 characters', () => {
        const prefix = 't'.repeat(70);
        const tools = listSessionTools(
            session({
                compiledToolset: {
                    ['i'.repeat(100)]: {
                        provider: 'notion',
                        pinned: [tool(`${prefix}_read`), tool(`${prefix}_write`), tool(`${prefix}_delete`)],
                        searchable: []
                    }
                }
            })
        );

        const names = tools.slice(2).map((listed) => listed.name);
        const base = `${'i'.repeat(31)}__${'t'.repeat(31)}`;
        expect(names).toStrictEqual([base, `${base.slice(0, 62)}_2`, `${base.slice(0, 62)}_3`]);
        for (const name of names) {
            expect(name.length).toBeLessThanOrEqual(64);
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
        expect(callable.get('notion__upsert_doc')).toStrictEqual({
            integrationId: 'notion',
            name: 'upsert_doc',
            description: 'upsert_doc description',
            pinned: false
        });
        expect(callable.get('notion__read_doc')).toStrictEqual({
            integrationId: 'notion',
            name: 'read_doc',
            description: 'read_doc description',
            pinned: true
        });
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
        expect(callable.get('a_b__c')).toStrictEqual({ integrationId: 'a.b', name: 'c', description: 'c description', pinned: true });
        expect(callable.get('a_b__c_2')).toStrictEqual({ integrationId: 'a_b', name: 'c', description: 'c description', pinned: false });
    });

    it('keeps a page worth of tools listable', () => {
        const pinned = Array.from({ length: TOOLS_PAGE_SIZE * 2 }, (_, index) => tool(`action_${index}`));
        const tools = listSessionTools(session({ compiledToolset: { notion: { provider: 'notion', pinned, searchable: [] } } }));

        expect(tools).toHaveLength(TOOLS_PAGE_SIZE * 2 + 2);
    });
});

describe('actionInputSchemaOf', () => {
    const model: JSONSchema7 = { type: 'object', properties: { title: { type: 'string' } } };

    it('nests the input model under input, with its definitions at the root', () => {
        expect(
            actionInputSchemaOf({
                kind: 'schema',
                schema: { $schema: DRAFT_07, definitions: { ReadDocInput: model }, $ref: '#/definitions/ReadDocInput' }
            })
        ).toMatchObject({ $schema: DRAFT_07, properties: { input: { $ref: '#/definitions/ReadDocInput' } }, definitions: { ReadDocInput: model } });
    });

    it('hoists definitions nested in the input model so its refs resolve', () => {
        const nested: JSONSchema7 = {
            type: 'object',
            properties: { child: { $ref: '#/definitions/__schema0' } },
            definitions: { __schema0: { type: 'string' } }
        };

        expect(
            actionInputSchemaOf({ kind: 'schema', schema: { $schema: DRAFT_07, definitions: { ReadDocInput: nested }, $ref: '#/definitions/ReadDocInput' } })
        ).toMatchObject({ definitions: { ReadDocInput: nested, __schema0: { type: 'string' } } });
    });

    it('lists an input that is not an object, which the wrapper makes callable directly', () => {
        const schema: JSONSchema7 = { $schema: DRAFT_07, definitions: { ReadDocInput: { type: 'array' } }, $ref: '#/definitions/ReadDocInput' };

        expect(actionInputSchemaOf({ kind: 'schema', schema })).toMatchObject({ properties: { input: { $ref: '#/definitions/ReadDocInput' } } });
    });

    it('lists an action with no input as taking only the goal and the intent', () => {
        expect(actionInputSchemaOf({ kind: 'none' })).toStrictEqual(directCallInputSchema('none'));
    });

    it('accepts any input when the input could not be read', () => {
        expect(actionInputSchemaOf({ kind: 'unavailable' } satisfies AgentSessionToolInput)).toStrictEqual(OPEN_INPUT_SCHEMA);
    });
});
