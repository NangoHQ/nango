import { ChevronRight, Search } from 'lucide-react';
import { useState } from 'react';

import { Button, InputGroup, InputGroupAddon, InputGroupInput, LinkButton } from '@nangohq/design-system';

import { Checkbox } from '@/components/ui/Checkbox';
import { cn } from '@/utils/utils';
import { ALL_INDIVIDUAL_SCOPES, isScopeSelected, SCOPE_GROUPS, toggleCredential, toggleGroup, toggleScope } from '../scope-logic';

import type { ScopeGroup } from '../scope-logic';

interface ScopeRow {
    scope: string;
    label: string;
    checked: boolean;
    toggle: () => string[];
}

function groupRows(group: ScopeGroup, selected: string[]): ScopeRow[] {
    return group.items.flatMap((item) => {
        const credentialsChecked = !!item.credentials && isScopeSelected(item.credentials, selected);
        const rows: ScopeRow[] = [
            {
                scope: item.value,
                label: item.label,
                checked: isScopeSelected(item.value, selected) || credentialsChecked,
                toggle: () => toggleScope(item.value, item.credentials, selected)
            }
        ];
        if (item.credentials) {
            const credentials = item.credentials;
            rows.push({
                scope: credentials,
                label: `${item.label}:with_credentials`,
                checked: credentialsChecked,
                toggle: () => toggleCredential(item.value, credentials, selected)
            });
        }
        return rows;
    });
}

function groupCheckedState(on: number, total: number): boolean | 'indeterminate' {
    if (on === 0) return false;
    if (on === total) return true;
    return 'indeterminate';
}

export function countSelectedScopes(scopes: string[]): number {
    return SCOPE_GROUPS.reduce((acc, group) => acc + groupRows(group, scopes).filter((row) => row.checked).length, 0);
}

function partiallySelectedGroups(selected: string[]): Record<string, boolean> {
    const expanded: Record<string, boolean> = {};
    for (const group of SCOPE_GROUPS) {
        const rows = groupRows(group, selected);
        const on = rows.filter((row) => row.checked).length;
        expanded[group.group] = on > 0 && on < rows.length;
    }
    return expanded;
}

interface ScopesPickerProps {
    selected: string[];
    onChange: (scopes: string[]) => void;
    readOnly?: boolean;
    showEmptyError?: boolean;
}

export const ScopesPicker: React.FC<ScopesPickerProps> = ({ selected, onChange, readOnly = false, showEmptyError = false }) => {
    const [query, setQuery] = useState('');
    const [expanded, setExpanded] = useState<Record<string, boolean>>(() => partiallySelectedGroups(selected));
    const q = query.trim().toLowerCase();

    const groups = SCOPE_GROUPS.map((group) => {
        const rows = groupRows(group, selected);
        const on = rows.filter((r) => r.checked).length;
        const visible = rows.filter((r) => {
            if (readOnly && !r.checked) return false;
            return !q || r.scope.toLowerCase().includes(q) || group.group.toLowerCase().includes(q);
        });
        return { group, rows, on, visible };
    }).filter(({ on, visible }) => visible.length > 0 && (!readOnly || on > 0));

    return (
        <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
                <span id="scopes-label" className="type-text-medium-sm text-text-default">
                    Scopes
                </span>
                <span className="flex-1 type-text-regular-xs text-text-muted">
                    {countSelectedScopes(selected)} of {ALL_INDIVIDUAL_SCOPES.length} selected
                </span>
                {!readOnly && (
                    <Button variant="ghost" size="sm" onClick={() => onChange([])} disabled={selected.length === 0}>
                        Clear
                    </Button>
                )}
            </div>

            <div
                role="group"
                aria-labelledby="scopes-label"
                className="overflow-hidden rounded-ds-sm border-ds-hairline border-border-default bg-surface-panel"
            >
                {!readOnly && (
                    <div className="border-b border-border-muted p-2">
                        <InputGroup size="sm">
                            <InputGroupAddon>
                                <Search />
                            </InputGroupAddon>
                            <InputGroupInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter scopes" aria-label="Filter scopes" />
                        </InputGroup>
                    </div>
                )}

                {groups.length === 0 && (
                    <div className="flex items-center gap-1 p-4 type-text-regular-sm text-text-secondary">
                        No scopes match “{query}”.
                        <LinkButton size="md" onClick={() => setQuery('')}>
                            Clear filter
                        </LinkButton>
                    </div>
                )}

                {groups.map(({ group, rows, on, visible }) => {
                    const open = q ? true : !!expanded[group.group];
                    const all = on === rows.length;
                    const groupId = `scope-group-${group.group.replace(/\s+/g, '-').toLowerCase()}`;
                    return (
                        <div key={group.group} className="border-b border-border-muted last:border-b-0">
                            <div className="relative flex h-9 items-center gap-2 pr-2.5 pl-1 hover:bg-interactive-ghost-hover">
                                <button
                                    type="button"
                                    aria-expanded={open}
                                    aria-controls={groupId}
                                    aria-label={`${open ? 'Collapse' : 'Expand'} ${group.group}`}
                                    disabled={!!q}
                                    onClick={() => setExpanded((e) => ({ ...e, [group.group]: !open }))}
                                    className="focus-default inline-flex size-6 cursor-pointer items-center justify-center rounded-ds-xs text-icon-secondary after:absolute after:inset-0 disabled:cursor-default disabled:text-icon-disabled"
                                >
                                    <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
                                </button>
                                {!readOnly && (
                                    <div className="relative z-10 flex">
                                        <Checkbox
                                            aria-label={group.group}
                                            checked={groupCheckedState(on, rows.length)}
                                            onCheckedChange={() => onChange(toggleGroup(group, selected))}
                                        />
                                    </div>
                                )}
                                <span className="min-w-0 flex-1 truncate type-text-medium-sm text-text-default">{group.group}</span>
                                <span className={cn('shrink-0 type-text-regular-xs', all ? 'text-text-secondary' : 'text-text-muted')}>
                                    {all ? 'All' : `${on} of ${rows.length}`}
                                </span>
                            </div>
                            {open && (
                                <div id={groupId} className="flex flex-col gap-0.5 pr-2 pb-2 pl-9">
                                    {visible.map((row) => (
                                        <label
                                            key={row.scope}
                                            title={row.scope}
                                            className={cn(
                                                'flex h-7 min-w-0 items-center gap-2 rounded-ds-xs px-1.5',
                                                !readOnly && 'cursor-pointer hover:bg-interactive-ghost-hover'
                                            )}
                                        >
                                            {!readOnly && <Checkbox size="sm" checked={row.checked} onCheckedChange={() => onChange(row.toggle())} />}
                                            <code className="truncate type-code-regular-xs text-text-default">{row.label}</code>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {showEmptyError && selected.length === 0 && <p className="type-text-regular-xs text-status-danger-text">Select at least one scope.</p>}
        </div>
    );
};
