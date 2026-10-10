import { describe, expect, it } from 'vitest';

import { compileToolsetFromFunctions } from './agentSessionToolset.service.js';

import type { McpServerDiscovery } from './agentSessionMcpDiscovery.service.js';
import type { AgentSessionToolsetCompilationError } from './agentSessionToolset.service.js';
import type { IntegrationFunctionRow } from '@nangohq/shared';
import type {
    AgentSessionCompiledIntegration,
    AgentSessionCompiledTool,
    AgentSessionCompiledToolset,
    AgentSessionPinnedTools,
    AgentSessionToolsetPolicy
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';

function action(integrationId: string, name: string, overrides: Partial<IntegrationFunctionRow> = {}): IntegrationFunctionRow {
    return {
        integration_id: integrationId,
        provider: integrationId,
        name,
        type: 'action',
        description: `${name} description`,
        enabled: true,
        ...overrides
    };
}

function emptyIntegration(integrationId: string): IntegrationFunctionRow {
    return { integration_id: integrationId, provider: integrationId, name: null, type: null, description: null, enabled: null };
}

const functions: IntegrationFunctionRow[] = [
    action('notion', 'read_doc'),
    action('notion', 'upsert_doc'),
    action('notion', 'delete_doc'),
    action('notion', 'sync_pages', { type: 'sync' }),
    action('notion', 'archive_doc', { enabled: false }),
    action('slack', 'send_message'),
    action('slack', 'list_channels'),
    emptyIntegration('gmail')
];

function compile({
    toolset,
    pinnedTools,
    connectedIntegrations = ['notion', 'slack']
}: {
    toolset?: AgentSessionToolsetPolicy | undefined;
    pinnedTools?: AgentSessionPinnedTools | undefined;
    connectedIntegrations?: string[];
}) {
    return compileToolsetFromFunctions({ toolset, pinnedTools, connectedIntegrations, functions });
}

function integration(compiled: AgentSessionCompiledToolset, integrationId: string): AgentSessionCompiledIntegration {
    const entry = compiled[integrationId];
    if (!entry) {
        throw new Error(`Expected ${integrationId} in the compiled toolset`);
    }

    return entry;
}

function names(tools: AgentSessionCompiledTool[]): string[] {
    return tools.map((tool) => tool.name);
}

function expectError(result: Result<AgentSessionCompiledToolset, AgentSessionToolsetCompilationError>): AgentSessionToolsetCompilationError {
    if (!result.isErr()) {
        throw new Error('Expected the compilation to fail');
    }

    return result.error;
}

describe('compileToolset', () => {
    it('defaults to every connected integration, all searchable', () => {
        const compiled = compile({ toolset: undefined });

        expect(compiled.isOk()).toBe(true);
        expect(compiled.unwrap()).toEqual({
            notion: {
                provider: 'notion',
                pinned: [],
                searchable: [
                    { name: 'read_doc', description: 'read_doc description' },
                    { name: 'upsert_doc', description: 'upsert_doc description' },
                    { name: 'delete_doc', description: 'delete_doc description' }
                ]
            },
            slack: {
                provider: 'slack',
                pinned: [],
                searchable: [
                    { name: 'send_message', description: 'send_message description' },
                    { name: 'list_channels', description: 'list_channels description' }
                ]
            }
        });
    });

    it('excludes syncs and disabled actions from the default', () => {
        const compiled = compile({ toolset: undefined, connectedIntegrations: ['notion'] });

        expect(names(integration(compiled.unwrap(), 'notion').searchable)).toEqual(['read_doc', 'upsert_doc', 'delete_doc']);
    });

    it('takes the whole environment on the explicit star, connected or not', () => {
        const compiled = compile({ toolset: '*' });

        expect(Object.keys(compiled.unwrap())).toEqual(['notion', 'slack', 'gmail']);
        expect(integration(compiled.unwrap(), 'gmail')).toEqual({ provider: 'gmail', pinned: [], searchable: [] });
    });

    it('treats an explicit allow as an allowlist', () => {
        const compiled = compile({ toolset: { notion: { allow: ['read_doc'], deny: [] } } });

        expect(Object.keys(compiled.unwrap())).toEqual(['notion']);
        expect(names(integration(compiled.unwrap(), 'notion').searchable)).toEqual(['read_doc']);
    });

    it('subtracts a deny list from everything else', () => {
        const compiled = compile({ toolset: { notion: { allow: '*', deny: ['delete_doc'] } } });

        expect(names(integration(compiled.unwrap(), 'notion').searchable)).toEqual(['read_doc', 'upsert_doc']);
    });

    it('lets deny win over an explicit allow', () => {
        const compiled = compile({ toolset: { notion: { allow: ['read_doc', 'delete_doc'], deny: ['delete_doc'] } } });

        expect(names(integration(compiled.unwrap(), 'notion').searchable)).toEqual(['read_doc']);
    });

    it('splits pinned tools out of the searchable set', () => {
        const compiled = compile({ toolset: { notion: { allow: '*', deny: [] } }, pinnedTools: { notion: ['upsert_doc'] } });

        expect(names(integration(compiled.unwrap(), 'notion').pinned)).toEqual(['upsert_doc']);
        expect(names(integration(compiled.unwrap(), 'notion').searchable)).toEqual(['read_doc', 'delete_doc']);
    });

    it('pins against the default toolset', () => {
        const compiled = compile({ toolset: undefined, pinnedTools: { slack: ['send_message'] } });

        expect(names(integration(compiled.unwrap(), 'slack').pinned)).toEqual(['send_message']);
    });

    it('rejects an integration that does not exist in the environment', () => {
        const compiled = expectError(compile({ toolset: { notion: { allow: '*', deny: [] }, hubspot: { allow: '*', deny: [] } } }));

        expect(compiled.code).toBe('unknown_integration');
        expect(compiled.payload).toEqual({ integrations: ['hubspot'] });
    });

    it('rejects pinning on an integration that does not exist', () => {
        const compiled = expectError(compile({ toolset: { notion: { allow: '*', deny: [] } }, pinnedTools: { hubspot: ['anything'] } }));

        expect(compiled.code).toBe('unknown_integration');
        expect(compiled.payload).toEqual({ integrations: ['hubspot'] });
    });

    it('rejects an allowed tool that does not exist', () => {
        const compiled = expectError(compile({ toolset: { notion: { allow: ['read_doc', 'read_dco'], deny: [] } } }));

        expect(compiled.code).toBe('unknown_tool');
        expect(compiled.payload).toEqual({ tools: [{ integration_id: 'notion', tool: 'read_dco' }] });
    });

    it('rejects a denied tool that does not exist, so a typo cannot silently expose it', () => {
        const compiled = expectError(compile({ toolset: { notion: { allow: '*', deny: ['delete_dco'] } } }));

        expect(compiled.code).toBe('unknown_tool');
        expect(compiled.payload).toEqual({ tools: [{ integration_id: 'notion', tool: 'delete_dco' }] });
    });

    it('rejects a disabled action as unknown', () => {
        const compiled = expectError(compile({ toolset: { notion: { allow: ['archive_doc'], deny: [] } } }));

        expect(compiled.code).toBe('unknown_tool');
        expect(compiled.payload).toEqual({ tools: [{ integration_id: 'notion', tool: 'archive_doc' }] });
    });

    it('rejects a function that is not an action', () => {
        const compiled = expectError(compile({ toolset: { notion: { allow: ['sync_pages'], deny: [] } } }));

        expect(compiled.code).toBe('unsupported_function_type');
        expect(compiled.payload).toEqual({ tools: [{ integration_id: 'notion', tool: 'sync_pages', type: 'sync' }] });
    });

    it('reports the wrong function type ahead of unknown names', () => {
        const compiled = expectError(compile({ toolset: { notion: { allow: ['sync_pages', 'read_dco'], deny: [] } } }));

        expect(compiled.code).toBe('unsupported_function_type');
    });

    it('rejects a pinned tool the toolset denies', () => {
        const compiled = expectError(compile({ toolset: { notion: { allow: ['read_doc'], deny: [] } }, pinnedTools: { notion: ['delete_doc'] } }));

        expect(compiled.code).toBe('tool_not_in_toolset');
        expect(compiled.payload).toEqual({ pinned: [{ integration_id: 'notion', tool: 'delete_doc' }] });
    });

    it('rejects a pinned tool on an integration outside the toolset', () => {
        const compiled = expectError(compile({ toolset: { notion: { allow: '*', deny: [] } }, pinnedTools: { slack: ['send_message'] } }));

        expect(compiled.code).toBe('tool_not_in_toolset');
        expect(compiled.payload).toEqual({ pinned: [{ integration_id: 'slack', tool: 'send_message' }] });
    });

    it('does not let a prototype integration id fall out of the result', () => {
        const proto = '__proto__';
        const compiled = compileToolsetFromFunctions({
            toolset: undefined,
            pinnedTools: undefined,
            connectedIntegrations: [proto],
            functions: [action(proto, 'read_doc')]
        });

        expect(Object.keys(compiled.unwrap())).toEqual([proto]);
    });
});

describe('compileToolsetFromFunctions with MCP servers', () => {
    const inputSchema = { type: 'object', properties: { query: { type: 'string' } } } as const;

    function mcpTool(name: string) {
        return { name, description: `${name} description`, inputSchema };
    }

    const linearFunctions: IntegrationFunctionRow[] = [emptyIntegration('linear-mcp'), action('linear-mcp', 'deployed_action')];

    function compileMcp({
        toolset,
        pinnedTools,
        discovery = {
            status: 'available',
            tools: [{ ...mcpTool('list_issues'), annotations: { readOnlyHint: true } }, mcpTool('create_issue'), mcpTool('deployed_action')]
        }
    }: {
        toolset?: AgentSessionToolsetPolicy | undefined;
        pinnedTools?: AgentSessionPinnedTools | undefined;
        discovery?: McpServerDiscovery;
    }) {
        return compileToolsetFromFunctions({
            toolset,
            pinnedTools,
            connectedIntegrations: ['linear-mcp'],
            functions: linearFunctions,
            mcpServers: new Map([['linear-mcp', discovery]])
        });
    }

    it('adds the tools the server listed, with their schemas, next to deployed actions', () => {
        const linear = integration(compileMcp({}).unwrap(), 'linear-mcp');

        expect(linear.mcpServer).toBe('available');
        expect(names(linear.searchable)).toEqual(['deployed_action', 'list_issues', 'create_issue']);
        expect(linear.searchable.find((tool) => tool.name === 'list_issues')?.mcp).toEqual({ inputSchema, annotations: { readOnlyHint: true } });
        expect(linear.searchable.find((tool) => tool.name === 'create_issue')?.mcp).toEqual({ inputSchema });
        expect(linear.searchable.find((tool) => tool.name === 'deployed_action')?.mcp).toBeUndefined();
    });

    it('keeps a server tool that shares its name with a sync, since a sync cannot be called', () => {
        const linear = integration(
            compileToolsetFromFunctions({
                toolset: { 'linear-mcp': { allow: ['list_issues'], deny: [] } },
                pinnedTools: undefined,
                connectedIntegrations: ['linear-mcp'],
                functions: [...linearFunctions, action('linear-mcp', 'list_issues', { type: 'sync' })],
                mcpServers: new Map([['linear-mcp', { status: 'available', tools: [mcpTool('list_issues')] }]])
            }).unwrap(),
            'linear-mcp'
        );

        expect(linear.searchable.map((tool) => ({ name: tool.name, mcp: tool.mcp }))).toEqual([{ name: 'list_issues', mcp: { inputSchema } }]);
    });

    it('filters and pins server tools by exact name', () => {
        const linear = integration(
            compileMcp({
                toolset: { 'linear-mcp': { allow: ['list_issues', 'create_issue'], deny: ['create_issue'] } },
                pinnedTools: { 'linear-mcp': ['list_issues'] }
            }).unwrap(),
            'linear-mcp'
        );

        expect(names(linear.pinned)).toEqual(['list_issues']);
        expect(linear.searchable).toEqual([]);
    });

    it('rejects a name the server did not list', () => {
        const compiled = expectError(compileMcp({ toolset: { 'linear-mcp': { allow: '*', deny: ['delete_issues'] } } }));

        expect(compiled.code).toBe('unknown_tool');
        expect(compiled.payload).toEqual({ tools: [{ integration_id: 'linear-mcp', tool: 'delete_issues' }] });
    });

    it('still rejects a pinned name the toolset denies when the server could not be listed', () => {
        const compiled = expectError(
            compileMcp({
                toolset: { 'linear-mcp': { allow: '*', deny: ['list_issues'] } },
                pinnedTools: { 'linear-mcp': ['list_issues'] },
                discovery: { status: 'unavailable' }
            })
        );

        expect(compiled.code).toBe('tool_not_in_toolset');
    });

    it('still compiles when the server could not be listed, and marks it unavailable', () => {
        const linear = integration(
            compileMcp({
                toolset: { 'linear-mcp': { allow: ['list_issues', 'deployed_action'], deny: [] } },
                pinnedTools: { 'linear-mcp': ['list_issues'] },
                discovery: { status: 'unavailable' }
            }).unwrap(),
            'linear-mcp'
        );

        expect(linear.mcpServer).toBe('unavailable');
        expect(linear.pinned).toEqual([]);
        expect(names(linear.searchable)).toEqual(['deployed_action']);
    });
});
