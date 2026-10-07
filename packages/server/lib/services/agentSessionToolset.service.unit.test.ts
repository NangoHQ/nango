import { describe, expect, it } from 'vitest';

import { compileToolsetFromFunctions } from './agentSessionToolset.service.js';

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
