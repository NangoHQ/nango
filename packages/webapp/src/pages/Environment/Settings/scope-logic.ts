import type { ApiKeyScope } from '@nangohq/types';

export interface ScopeItem {
    value: ApiKeyScope;
    label: string;
    credentials?: ApiKeyScope;
}

export interface ScopeGroup {
    group: string;
    items: ScopeItem[];
}

export const SCOPE_GROUPS: ScopeGroup[] = [
    {
        group: 'Integrations',
        items: [
            { value: 'environment:integrations:list', label: 'list', credentials: 'environment:integrations:list_credentials' },
            { value: 'environment:integrations:read', label: 'read', credentials: 'environment:integrations:read_credentials' },
            { value: 'environment:integrations:write', label: 'write' }
        ]
    },
    {
        group: 'Connections',
        items: [
            { value: 'environment:connections:list', label: 'list', credentials: 'environment:connections:list_credentials' },
            { value: 'environment:connections:read', label: 'read', credentials: 'environment:connections:read_credentials' },
            { value: 'environment:connections:write', label: 'write' }
        ]
    },
    { group: 'Connect Sessions', items: [{ value: 'environment:connect_sessions:write', label: 'write' }] },
    {
        group: 'Syncs',
        items: [
            { value: 'environment:syncs:read', label: 'read' },
            { value: 'environment:syncs:execute', label: 'execute' },
            { value: 'environment:syncs:manage', label: 'manage' }
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
    { group: 'Config', items: [{ value: 'environment:config:read', label: 'read' }] },
    { group: 'MCP', items: [{ value: 'environment:mcp', label: 'mcp' }] }
];

export function allGroupScopes(group: ScopeGroup): string[] {
    return group.items.flatMap((item) => (item.credentials ? [item.value, item.credentials] : [item.value]));
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
    const parts = group.items[0].value.split(':');
    if (parts.length < 3 || allScopes.length <= 1) {
        return null;
    }
    return parts.slice(0, -1).join(':') + ':*';
}

export function isScopeSelected(scope: string, selectedScopes: string[]): boolean {
    if (selectedScopes.includes(scope)) return true;
    return selectedScopes.some((s) => s.endsWith(':*') && scope.startsWith(s.slice(0, -1)));
}

export function toggleScope(scope: string, credentialChild: string | undefined, selectedScopes: string[]): string[] {
    const isSelected = isScopeSelected(scope, selectedScopes) || (!!credentialChild && isScopeSelected(credentialChild, selectedScopes));
    if (isSelected) {
        const matchingWildcard = selectedScopes.find((s) => s.endsWith(':*') && s !== scope && scope.startsWith(s.slice(0, -1)));
        if (matchingWildcard) {
            const expanded = ALL_INDIVIDUAL_SCOPES.filter((s) => s.startsWith(matchingWildcard.slice(0, -1)));
            const without = expanded.filter((s) => s !== scope && s !== credentialChild);
            const rest = selectedScopes.filter((s) => s !== matchingWildcard);
            return [...rest, ...without];
        } else {
            return selectedScopes.filter((s) => s !== scope && s !== credentialChild);
        }
    } else {
        return [...selectedScopes, scope];
    }
}

export function toggleCredential(parent: string, credential: string, selectedScopes: string[]): string[] {
    const isSelected = isScopeSelected(credential, selectedScopes);
    if (isSelected) {
        const matchingWildcard = selectedScopes.find((s) => s.endsWith(':*') && s !== credential && credential.startsWith(s.slice(0, -1)));
        if (matchingWildcard) {
            const expanded = ALL_INDIVIDUAL_SCOPES.filter((s) => s.startsWith(matchingWildcard.slice(0, -1)));
            const without = expanded.filter((s) => s !== credential);
            const rest = selectedScopes.filter((s) => s !== matchingWildcard);
            return [...rest, ...without];
        } else {
            return [...selectedScopes.filter((s) => s !== credential), ...(selectedScopes.includes(parent) ? [] : [parent])];
        }
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
        const cleaned = selectedScopes.filter((s) => !all.includes(s));
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
