import { describe, expect, it } from 'vitest';

import {
    ALL_INDIVIDUAL_SCOPES,
    SCOPE_GROUPS,
    allGroupScopes,
    expandScopes,
    groupWildcard,
    isScopeSelected,
    toggleCredential,
    toggleGroup,
    toggleScope
} from './scope-logic';

describe('isScopeSelected', () => {
    it('exact match', () => {
        expect(isScopeSelected('environment:deploy', ['environment:deploy'])).toBe(true);
    });

    it('no match', () => {
        expect(isScopeSelected('environment:proxy', ['environment:deploy'])).toBe(false);
    });

    it('wildcard environment:* matches any scope', () => {
        expect(isScopeSelected('environment:integrations:list', ['environment:*'])).toBe(true);
        expect(isScopeSelected('environment:deploy', ['environment:*'])).toBe(true);
    });

    it('group wildcard matches scopes in group', () => {
        expect(isScopeSelected('environment:integrations:list', ['environment:integrations:*'])).toBe(true);
        expect(isScopeSelected('environment:integrations:write', ['environment:integrations:*'])).toBe(true);
    });

    it('group wildcard does not match other groups', () => {
        expect(isScopeSelected('environment:connections:list', ['environment:integrations:*'])).toBe(false);
    });

    it('empty scopes returns false', () => {
        expect(isScopeSelected('environment:deploy', [])).toBe(false);
    });
});

describe('expandScopes', () => {
    it('environment:* expands to all individual scopes', () => {
        const expanded = expandScopes(['environment:*']);
        expect(expanded).toEqual(ALL_INDIVIDUAL_SCOPES);
        expect(expanded.length).toBe(21);
    });

    it('group wildcard expands to group scopes', () => {
        const expanded = expandScopes(['environment:integrations:*']);
        expect(expanded).toEqual([
            'environment:integrations:list',
            'environment:integrations:list_credentials',
            'environment:integrations:read',
            'environment:integrations:read_credentials',
            'environment:integrations:write'
        ]);
    });

    it('individual scope stays as-is', () => {
        expect(expandScopes(['environment:deploy'])).toEqual(['environment:deploy']);
    });

    it('mixed wildcards and individual scopes', () => {
        const expanded = expandScopes(['environment:integrations:*', 'environment:deploy']);
        expect(expanded).toContain('environment:integrations:list');
        expect(expanded).toContain('environment:integrations:write');
        expect(expanded).toContain('environment:deploy');
        expect(expanded).not.toContain('environment:connections:list');
    });
});

describe('groupWildcard', () => {
    it('returns wildcard for multi-scope groups with 3+ segments', () => {
        const integrations = SCOPE_GROUPS.find((g) => g.group === 'Integrations')!;
        expect(groupWildcard(integrations)).toBe('environment:integrations:*');
    });

    it('returns null for single-scope 2-segment groups (Deploy)', () => {
        const deploy = SCOPE_GROUPS.find((g) => g.group === 'Deploy')!;
        expect(groupWildcard(deploy)).toBeNull();
    });

    it('returns null for single-scope groups (Proxy, MCP)', () => {
        const proxy = SCOPE_GROUPS.find((g) => g.group === 'Proxy')!;
        expect(groupWildcard(proxy)).toBeNull();

        const mcp = SCOPE_GROUPS.find((g) => g.group === 'MCP')!;
        expect(groupWildcard(mcp)).toBeNull();
    });

    it('returns wildcard for Syncs (multiple items, 3 segments)', () => {
        const syncs = SCOPE_GROUPS.find((g) => g.group === 'Syncs')!;
        expect(groupWildcard(syncs)).toBe('environment:syncs:*');
    });
});

describe('toggleScope', () => {
    it('adds scope when not selected', () => {
        const result = toggleScope('environment:deploy', undefined, []);
        expect(result).toEqual(['environment:deploy']);
    });

    it('removes scope when selected', () => {
        const result = toggleScope('environment:deploy', undefined, ['environment:deploy']);
        expect(result).toEqual([]);
    });

    it('removes scope and its credential child', () => {
        const result = toggleScope('environment:integrations:list', 'environment:integrations:list_credentials', [
            'environment:integrations:list',
            'environment:integrations:list_credentials'
        ]);
        expect(result).not.toContain('environment:integrations:list');
        expect(result).not.toContain('environment:integrations:list_credentials');
    });

    it('unchecking parent when only credential is stored removes credential', () => {
        const result = toggleScope('environment:integrations:list', 'environment:integrations:list_credentials', ['environment:integrations:list_credentials']);
        expect(result).not.toContain('environment:integrations:list');
        expect(result).not.toContain('environment:integrations:list_credentials');
    });

    it('expands wildcard when unchecking a scope selected via wildcard', () => {
        const result = toggleScope('environment:integrations:list', 'environment:integrations:list_credentials', ['environment:integrations:*']);
        expect(result).not.toContain('environment:integrations:*');
        expect(result).not.toContain('environment:integrations:list');
        expect(result).not.toContain('environment:integrations:list_credentials');
        expect(result).toContain('environment:integrations:read');
        expect(result).toContain('environment:integrations:read_credentials');
        expect(result).toContain('environment:integrations:write');
    });

    it('preserves other scopes when removing', () => {
        const result = toggleScope('environment:deploy', undefined, ['environment:deploy', 'environment:proxy']);
        expect(result).toEqual(['environment:proxy']);
    });
});

describe('toggleCredential', () => {
    it('checking credentials replaces parent (superset)', () => {
        const result = toggleCredential('environment:integrations:list', 'environment:integrations:list_credentials', ['environment:integrations:list']);
        expect(result).toContain('environment:integrations:list_credentials');
        expect(result).not.toContain('environment:integrations:list');
    });

    it('checking credentials when parent not selected stores only credential', () => {
        const result = toggleCredential('environment:integrations:list', 'environment:integrations:list_credentials', []);
        expect(result).toEqual(['environment:integrations:list_credentials']);
        expect(result).not.toContain('environment:integrations:list');
    });

    it('unchecking credentials downgrades to parent', () => {
        const result = toggleCredential('environment:integrations:list', 'environment:integrations:list_credentials', [
            'environment:integrations:list_credentials'
        ]);
        expect(result).toContain('environment:integrations:list');
        expect(result).not.toContain('environment:integrations:list_credentials');
    });

    it('never stores both parent and credential (no redundancy)', () => {
        // Check credential when parent exists
        const result1 = toggleCredential('environment:integrations:list', 'environment:integrations:list_credentials', ['environment:integrations:list']);
        const hasBoth1 = result1.includes('environment:integrations:list') && result1.includes('environment:integrations:list_credentials');
        expect(hasBoth1).toBe(false);

        // Check credential when nothing exists
        const result2 = toggleCredential('environment:integrations:list', 'environment:integrations:list_credentials', []);
        const hasBoth2 = result2.includes('environment:integrations:list') && result2.includes('environment:integrations:list_credentials');
        expect(hasBoth2).toBe(false);
    });

    it('unchecking credential from wildcard expands and removes only the credential', () => {
        const result = toggleCredential('environment:integrations:list', 'environment:integrations:list_credentials', ['environment:integrations:*']);
        expect(result).not.toContain('environment:integrations:*');
        expect(result).not.toContain('environment:integrations:list_credentials');
        expect(result).toContain('environment:integrations:list');
        expect(result).toContain('environment:integrations:read');
        expect(result).toContain('environment:integrations:read_credentials');
        expect(result).toContain('environment:integrations:write');
    });

    it('preserves other scopes', () => {
        const result = toggleCredential('environment:integrations:list', 'environment:integrations:list_credentials', [
            'environment:integrations:list',
            'environment:deploy'
        ]);
        expect(result).toContain('environment:integrations:list_credentials');
        expect(result).toContain('environment:deploy');
    });
});

describe('toggleGroup', () => {
    const integrations = SCOPE_GROUPS.find((g) => g.group === 'Integrations')!;
    const deploy = SCOPE_GROUPS.find((g) => g.group === 'Deploy')!;

    it('checking multi-scope group stores wildcard', () => {
        const result = toggleGroup(integrations, []);
        expect(result).toEqual(['environment:integrations:*']);
    });

    it('unchecking wildcard group removes wildcard', () => {
        const result = toggleGroup(integrations, ['environment:integrations:*']);
        expect(result).not.toContain('environment:integrations:*');
    });

    it('checking single-scope group stores individual scope', () => {
        const result = toggleGroup(deploy, []);
        expect(result).toContain('environment:deploy');
        expect(result).not.toContain('environment:*');
    });

    it('unchecking single-scope group removes individual scope', () => {
        const result = toggleGroup(deploy, ['environment:deploy']);
        expect(result).not.toContain('environment:deploy');
    });

    it('does nothing when full access is set', () => {
        const result = toggleGroup(integrations, ['environment:*']);
        expect(result).toEqual(['environment:*']);
    });

    it('checking group removes individual scopes and stores wildcard', () => {
        const result = toggleGroup(integrations, ['environment:integrations:list', 'environment:integrations:write']);
        expect(result).toEqual(['environment:integrations:*']);
        expect(result).not.toContain('environment:integrations:list');
        expect(result).not.toContain('environment:integrations:write');
    });

    it('preserves other scopes when toggling group', () => {
        const result = toggleGroup(integrations, ['environment:deploy']);
        expect(result).toContain('environment:integrations:*');
        expect(result).toContain('environment:deploy');
    });
});

describe('allGroupScopes', () => {
    it('includes credential scopes', () => {
        const integrations = SCOPE_GROUPS.find((g) => g.group === 'Integrations')!;
        const scopes = allGroupScopes(integrations);
        expect(scopes).toContain('environment:integrations:list');
        expect(scopes).toContain('environment:integrations:list_credentials');
        expect(scopes).toHaveLength(5);
    });

    it('groups without credentials have no extra scopes', () => {
        const syncs = SCOPE_GROUPS.find((g) => g.group === 'Syncs')!;
        const scopes = allGroupScopes(syncs);
        expect(scopes).toEqual(['environment:syncs:read', 'environment:syncs:execute', 'environment:syncs:manage']);
    });
});
