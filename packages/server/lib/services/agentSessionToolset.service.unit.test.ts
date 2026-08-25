import { describe, expect, it } from 'vitest';

import { agentSessionPinnedToolsSchema, agentSessionToolsetSchema, compileToolsetFromCatalog, MAX_INTEGRATIONS } from './agentSessionToolset.service.js';

import type { AgentSessionToolsetCompilationError } from './agentSessionToolset.service.js';
import type { IntegrationFunctionCatalogRow } from '@nangohq/shared';
import type {
    AgentSessionCompiledIntegration,
    AgentSessionCompiledTool,
    AgentSessionCompiledToolset,
    AgentSessionPinnedTools,
    AgentSessionToolsetPolicy
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';

function action(integrationId: string, name: string, overrides: Partial<IntegrationFunctionCatalogRow> = {}): IntegrationFunctionCatalogRow {
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

function emptyIntegration(integrationId: string): IntegrationFunctionCatalogRow {
    return { integration_id: integrationId, provider: integrationId, name: null, type: null, description: null, enabled: null };
}

const catalog: IntegrationFunctionCatalogRow[] = [
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
    return compileToolsetFromCatalog({ toolset, pinnedTools, connectedIntegrations, catalog });
}

function parseToolset(input: unknown): AgentSessionToolsetPolicy {
    return agentSessionToolsetSchema.parse(input) as AgentSessionToolsetPolicy;
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

describe('agentSessionToolsetSchema', () => {
    it('normalises every shorthand to an allow and deny pair', () => {
        expect(
            parseToolset({
                notion: { allow: { tools: ['read_doc'] } },
                slack: { deny: { tools: ['send_message'] } },
                github: '*',
                'google-calendar': { deny: '*' },
                linear: {}
            })
        ).toEqual({
            notion: { allow: ['read_doc'], deny: [] },
            slack: { allow: '*', deny: ['send_message'] },
            github: { allow: '*', deny: [] },
            'google-calendar': { allow: [], deny: [] },
            linear: { allow: '*', deny: [] }
        });
    });

    it('keeps deny alongside an explicit allow', () => {
        expect(parseToolset({ notion: { allow: { tools: ['read_doc', 'upsert_doc'] }, deny: { tools: ['upsert_doc'] } } })).toEqual({
            notion: { allow: ['read_doc', 'upsert_doc'], deny: ['upsert_doc'] }
        });
    });

    it('accepts the environment wide shorthand', () => {
        expect(parseToolset('*')).toBe('*');
    });

    it('rejects an empty toolset', () => {
        expect(agentSessionToolsetSchema.safeParse({}).success).toBe(false);
    });

    it('rejects more integrations than the cap', () => {
        const oversized = Object.fromEntries(Array.from({ length: MAX_INTEGRATIONS + 1 }, (_, index) => [`integration-${index}`, '*']));
        expect(agentSessionToolsetSchema.safeParse(oversized).success).toBe(false);
    });

    it('rejects unknown keys on an integration policy', () => {
        expect(agentSessionToolsetSchema.safeParse({ notion: { allow: { tags: { destructive: true } } } }).success).toBe(false);
    });

    it('rejects a pinned tools map keyed by nothing', () => {
        expect(agentSessionPinnedToolsSchema.safeParse({ notion: ['read_doc'] }).success).toBe(true);
        expect(agentSessionPinnedToolsSchema.safeParse({ notion: 'read_doc' }).success).toBe(false);
    });
});

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
        const compiled = compile({ toolset: parseToolset({ notion: { allow: { tools: ['read_doc'] } } }) });

        expect(Object.keys(compiled.unwrap())).toEqual(['notion']);
        expect(names(integration(compiled.unwrap(), 'notion').searchable)).toEqual(['read_doc']);
    });

    it('subtracts a deny list from everything else', () => {
        const compiled = compile({ toolset: parseToolset({ notion: { deny: { tools: ['delete_doc'] } } }) });

        expect(names(integration(compiled.unwrap(), 'notion').searchable)).toEqual(['read_doc', 'upsert_doc']);
    });

    it('lets deny win over an explicit allow', () => {
        const compiled = compile({ toolset: parseToolset({ notion: { allow: { tools: ['read_doc', 'delete_doc'] }, deny: { tools: ['delete_doc'] } } }) });

        expect(names(integration(compiled.unwrap(), 'notion').searchable)).toEqual(['read_doc']);
    });

    it('keeps an integration denied outright but empty', () => {
        const compiled = compile({ toolset: parseToolset({ notion: { deny: '*' }, slack: '*' }) });

        expect(integration(compiled.unwrap(), 'notion')).toEqual({ provider: 'notion', pinned: [], searchable: [] });
        expect(names(integration(compiled.unwrap(), 'slack').searchable)).toEqual(['send_message', 'list_channels']);
    });

    it('splits pinned tools out of the searchable set', () => {
        const compiled = compile({ toolset: parseToolset({ notion: '*' }), pinnedTools: { notion: ['upsert_doc'] } });

        expect(names(integration(compiled.unwrap(), 'notion').pinned)).toEqual(['upsert_doc']);
        expect(names(integration(compiled.unwrap(), 'notion').searchable)).toEqual(['read_doc', 'delete_doc']);
    });

    it('pins against the default toolset', () => {
        const compiled = compile({ toolset: undefined, pinnedTools: { slack: ['send_message'] } });

        expect(names(integration(compiled.unwrap(), 'slack').pinned)).toEqual(['send_message']);
    });

    it('rejects an integration that does not exist in the environment', () => {
        const compiled = expectError(compile({ toolset: parseToolset({ notion: '*', hubspot: '*' }) }));

        expect(compiled.code).toBe('unknown_integration');
        expect(compiled.payload).toEqual({ integrations: ['hubspot'] });
    });

    it('rejects pinning on an integration that does not exist', () => {
        const compiled = expectError(compile({ toolset: parseToolset({ notion: '*' }), pinnedTools: { hubspot: ['anything'] } }));

        expect(compiled.code).toBe('unknown_integration');
        expect(compiled.payload).toEqual({ integrations: ['hubspot'] });
    });

    it('rejects an allowed tool that does not exist', () => {
        const compiled = expectError(compile({ toolset: parseToolset({ notion: { allow: { tools: ['read_doc', 'read_dco'] } } }) }));

        expect(compiled.code).toBe('unknown_tool');
        expect(compiled.payload).toEqual({ tools: [{ integration_id: 'notion', tool: 'read_dco' }] });
    });

    it('rejects a denied tool that does not exist, so a typo cannot silently expose it', () => {
        const compiled = expectError(compile({ toolset: parseToolset({ notion: { deny: { tools: ['delete_dco'] } } }) }));

        expect(compiled.code).toBe('unknown_tool');
        expect(compiled.payload).toEqual({ tools: [{ integration_id: 'notion', tool: 'delete_dco' }] });
    });

    it('rejects a disabled action as unknown', () => {
        const compiled = expectError(compile({ toolset: parseToolset({ notion: { allow: { tools: ['archive_doc'] } } }) }));

        expect(compiled.code).toBe('unknown_tool');
        expect(compiled.payload).toEqual({ tools: [{ integration_id: 'notion', tool: 'archive_doc' }] });
    });

    it('rejects a function that is not an action', () => {
        const compiled = expectError(compile({ toolset: parseToolset({ notion: { allow: { tools: ['sync_pages'] } } }) }));

        expect(compiled.code).toBe('unsupported_function_type');
        expect(compiled.payload).toEqual({ tools: [{ integration_id: 'notion', tool: 'sync_pages', type: 'sync' }] });
    });

    it('reports the wrong function type ahead of unknown names', () => {
        const compiled = expectError(compile({ toolset: parseToolset({ notion: { allow: { tools: ['sync_pages', 'read_dco'] } } }) }));

        expect(compiled.code).toBe('unsupported_function_type');
    });

    it('rejects a pinned tool the toolset denies', () => {
        const compiled = expectError(
            compile({ toolset: parseToolset({ notion: { allow: { tools: ['read_doc'] } } }), pinnedTools: { notion: ['delete_doc'] } })
        );

        expect(compiled.code).toBe('tool_not_in_toolset');
        expect(compiled.payload).toEqual({ pinned: [{ integration_id: 'notion', tool: 'delete_doc' }] });
    });

    it('rejects a pinned tool on an integration outside the toolset', () => {
        const compiled = expectError(compile({ toolset: parseToolset({ notion: '*' }), pinnedTools: { slack: ['send_message'] } }));

        expect(compiled.code).toBe('tool_not_in_toolset');
        expect(compiled.payload).toEqual({ pinned: [{ integration_id: 'slack', tool: 'send_message' }] });
    });

    it('does not let a prototype integration id fall out of the result', () => {
        const proto = '__proto__';
        const compiled = compileToolsetFromCatalog({
            toolset: undefined,
            pinnedTools: undefined,
            connectedIntegrations: [proto],
            catalog: [action(proto, 'read_doc')]
        });

        expect(Object.keys(compiled.unwrap())).toEqual([proto]);
    });
});
