import type { ApiKeyScope } from '@nangohq/types';

export interface ScopeItem {
    value: ApiKeyScope;
    label: string;
    credentials?: ApiKeyScope;
}

export interface ScopeGroup {
    group: string;
    items: (ScopeItem | ScopeGroup)[];
}

export function isScopeGroup(item: ScopeItem | ScopeGroup): item is ScopeGroup {
    return 'group' in item;
}

export const SCOPE_GROUPS: ScopeGroup[] = [
    {
        group: 'Integrations',
        items: [
            { value: 'environment:integrations:list', label: 'list', credentials: 'environment:integrations:list_credentials' },
            { value: 'environment:integrations:list_functions', label: 'list functions' },
            { value: 'environment:integrations:read', label: 'read', credentials: 'environment:integrations:read_credentials' },
            { value: 'environment:integrations:create', label: 'create' },
            { value: 'environment:integrations:update', label: 'update' },
            { value: 'environment:integrations:delete', label: 'delete' },
            {
                group: 'Functions',
                items: [
                    { value: 'environment:integrations:functions:list', label: 'list' },
                    { value: 'environment:integrations:functions:read', label: 'read' },
                    { value: 'environment:integrations:functions:delete', label: 'delete' }
                ]
            }
        ]
    },
    {
        group: 'Connections',
        items: [
            { value: 'environment:connections:list', label: 'list', credentials: 'environment:connections:list_credentials' },
            { value: 'environment:connections:read', label: 'read', credentials: 'environment:connections:read_credentials' },
            { value: 'environment:connections:create', label: 'create' },
            { value: 'environment:connections:update', label: 'update' },
            { value: 'environment:connections:delete', label: 'delete' }
        ]
    },
    { group: 'Connect Sessions', items: [{ value: 'environment:connect_sessions:write', label: 'write' }] },
    {
        group: 'Syncs',
        items: [
            { value: 'environment:syncs:read', label: 'read' },
            { value: 'environment:syncs:execute', label: 'execute' },
            { value: 'environment:syncs:update', label: 'update' },
            { value: 'environment:syncs:variant:create', label: 'create variant' },
            { value: 'environment:syncs:variant:delete', label: 'delete variant' }
        ]
    },
    {
        group: 'Functions',
        items: [
            { value: 'environment:functions:compile', label: 'compile' },
            { value: 'environment:functions:dryrun', label: 'dryrun' }
        ]
    },
    { group: 'Deploy', items: [{ value: 'environment:deploy', label: 'deploy' }] },
    {
        group: 'Records',
        items: [
            { value: 'environment:records:read', label: 'read' },
            { value: 'environment:records:write', label: 'write' }
        ]
    },
    { group: 'Actions', items: [{ value: 'environment:actions:execute', label: 'execute' }] },
    { group: 'Proxy', items: [{ value: 'environment:proxy', label: 'proxy' }] },
    { group: 'Variables', items: [{ value: 'environment:variables:read', label: 'read' }] },
    { group: 'MCP', items: [{ value: 'environment:mcp', label: 'mcp' }] }
];

export function allGroupScopes(group: ScopeGroup): string[] {
    return group.items.flatMap((item) => {
        if (isScopeGroup(item)) {
            return allGroupScopes(item);
        }
        return item.credentials ? [item.value, item.credentials] : [item.value];
    });
}

export const ALL_INDIVIDUAL_SCOPES = SCOPE_GROUPS.flatMap((g) => allGroupScopes(g));

export function expandScopes(scopes: string[]): string[] {
    const expanded = new Set<string>();
    for (const scope of scopes) {
        if (scope === 'environment:*') {
            return ALL_INDIVIDUAL_SCOPES;
        }
        if (scope.endsWith(':*')) {
            const prefix = scope.slice(0, -1);
            for (const s of ALL_INDIVIDUAL_SCOPES) {
                if (s.startsWith(prefix)) {
                    expanded.add(s);
                }
            }
        } else {
            expanded.add(scope);
        }
    }
    return Array.from(expanded);
}

export function groupWildcard(group: ScopeGroup): string | null {
    const allScopes = allGroupScopes(group);
    if (allScopes.length <= 1) {
        return null;
    }
    const parts = allScopes[0].split(':');
    if (parts.length < 3) {
        return null;
    }
    return parts.slice(0, -1).join(':') + ':*';
}

export function isScopeSelected(scope: string, selectedScopes: string[]): boolean {
    if (selectedScopes.includes(scope)) return true;
    return selectedScopes.some((s) => s.endsWith(':*') && scope.startsWith(s.slice(0, -1)));
}

/**
 * Deselect `targets` when they're currently granted by a wildcard rather than
 * stored explicitly. The wildcard(s) covering them are expanded into their
 * individual leaf scopes, minus the targets — so unchecking one box doesn't
 * wipe the whole group. Returns null if no wildcard grants the targets (the
 * caller then just removes them directly).
 */
function expandWildcardsExcept(targets: string[], selectedScopes: string[]): string[] | null {
    const covering = selectedScopes.filter((s) => s.endsWith(':*') && targets.some((t) => t !== s && t.startsWith(s.slice(0, -1))));
    if (covering.length === 0) {
        return null;
    }
    const rest = selectedScopes.filter((s) => !covering.includes(s));
    const expanded = new Set<string>();
    for (const wc of covering) {
        const prefix = wc.slice(0, -1);
        for (const s of ALL_INDIVIDUAL_SCOPES) {
            if (s.startsWith(prefix)) {
                expanded.add(s);
            }
        }
    }
    for (const t of targets) {
        expanded.delete(t);
    }
    return [...rest, ...expanded];
}

export function toggleScope(scope: string, credentialChild: string | undefined, selectedScopes: string[]): string[] {
    const isSelected = isScopeSelected(scope, selectedScopes) || (!!credentialChild && isScopeSelected(credentialChild, selectedScopes));
    if (isSelected) {
        const targets = credentialChild ? [scope, credentialChild] : [scope];
        const expanded = expandWildcardsExcept(targets, selectedScopes);
        if (expanded) {
            return expanded;
        }
        return selectedScopes.filter((s) => s !== scope && s !== credentialChild);
    } else {
        return [...selectedScopes, scope];
    }
}

export function toggleCredential(parent: string, credential: string, selectedScopes: string[]): string[] {
    const isSelected = isScopeSelected(credential, selectedScopes);
    if (isSelected) {
        const expanded = expandWildcardsExcept([credential], selectedScopes);
        if (expanded) {
            return expanded;
        }
        return [...selectedScopes.filter((s) => s !== credential), ...(selectedScopes.includes(parent) ? [] : [parent])];
    } else {
        return [...selectedScopes.filter((s) => s !== parent), credential];
    }
}

export function toggleGroup(group: ScopeGroup, selectedScopes: string[]): string[] {
    if (selectedScopes.includes('environment:*')) return selectedScopes;
    const wc = groupWildcard(group);
    const all = allGroupScopes(group);
    if (wc && selectedScopes.includes(wc)) {
        return selectedScopes.filter((s) => s !== wc);
    } else if (wc) {
        const prefix = wc.slice(0, -1);
        const cleaned = selectedScopes.filter((s) => !s.startsWith(prefix));
        return [...cleaned, wc];
    } else {
        const allSelected = all.every((s) => selectedScopes.includes(s));
        if (allSelected) {
            return selectedScopes.filter((s) => !all.includes(s));
        } else {
            return Array.from(new Set([...selectedScopes, ...all]));
        }
    }
}
