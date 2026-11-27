import { Combobox } from '@base-ui/react';
import { CheckIcon, ChevronRight, MinusIcon, Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { LinkButton } from '@nangohq/design-system';

import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/utils/utils';

export interface FilterMenuOption {
    value: string;
    label: string;
    icon?: React.ReactNode;
    mono?: boolean;
    children?: FilterMenuOption[];
}

export type FilterCheckState = 'checked' | 'indeterminate' | 'unchecked';

export interface FilterMenuProps {
    label: string;
    trigger?: React.ReactElement;
    /** Ignored when `trigger` is set. */
    anchor?: React.RefObject<HTMLElement | null>;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    options: FilterMenuOption[];
    selected: string[];
    onToggle: (value: string) => void;
    onClear: () => void;
    checkState?: (value: string) => FilterCheckState;
    searchable?: boolean;
    searchPlaceholder?: string;
    /** Passing it turns off the menu's own filtering: the caller filters `options`. */
    onSearchChange?: (search: string) => void;
    loading?: boolean;
    error?: boolean;
    onRetry?: () => void;
    note?: React.ReactNode;
    max?: number;
    side?: 'bottom' | 'right';
    /** Off when a hover opens the menu, so moving the pointer past it can't steal focus or reset the search. */
    focusSearchOnOpen?: boolean;
    onBack?: () => void;
}

// Search bar height, its border and the list padding. Change them together, or a side pane's first row drifts off its row.
const SIDE_PANE_ALIGN_OFFSET = 37;

interface Row {
    option: FilterMenuOption;
    depth: 0 | 1;
    expandable: boolean;
}

const ROW =
    'flex h-7 w-full cursor-pointer items-center gap-2 rounded-ds-xs px-2 text-ds-sm text-text-default outline-none select-none data-highlighted:bg-state-hover data-highlighted:text-text-strong data-disabled:cursor-not-allowed data-disabled:opacity-50';

function matches(option: FilterMenuOption, query: string) {
    return option.label.toLowerCase().includes(query);
}

function buildRows(options: FilterMenuOption[], expanded: Set<string>, query: string): Row[] {
    const rows: Row[] = [];
    for (const option of options) {
        const children = option.children ?? [];
        const childMatches = query ? children.filter((child) => matches(child, query)) : children;
        if (query && !matches(option, query) && childMatches.length === 0) {
            continue;
        }
        rows.push({ option, depth: 0, expandable: children.length > 0 });
        const open = query ? childMatches.length > 0 : expanded.has(option.value);
        if (open) {
            for (const child of childMatches) {
                rows.push({ option: child, depth: 1, expandable: false });
            }
        }
    }
    return rows;
}

const CheckMark: React.FC<{ state: FilterCheckState }> = ({ state }) => (
    <span aria-hidden className="ml-auto flex size-3.5 shrink-0 items-center justify-center text-icon-default">
        {state === 'checked' && <CheckIcon className="size-3.5" />}
        {state === 'indeterminate' && <MinusIcon className="size-3.5" />}
    </span>
);

const EmptyState: React.FC<{ loading: boolean; error: boolean; searching: boolean; onRetry?: (() => void) | undefined }> = ({
    loading,
    error,
    searching,
    onRetry
}) => {
    if (loading) {
        return (
            <div className="flex justify-center py-3">
                <Spinner className="size-3.5 text-icon-secondary" />
            </div>
        );
    }
    if (error) {
        return (
            <div className="flex flex-col items-center gap-1 px-2 py-3 text-ds-xs text-text-muted">
                <span>Couldn&apos;t load values</span>
                {onRetry && (
                    <LinkButton tone="accent" size="sm" onClick={onRetry}>
                        Try again
                    </LinkButton>
                )}
            </div>
        );
    }
    return <div className="px-2 py-3 text-center text-ds-xs text-text-muted">{searching ? 'No matches' : 'No values'}</div>;
};

export const FilterMenu: React.FC<FilterMenuProps> = ({
    label,
    trigger,
    anchor,
    open,
    onOpenChange,
    options,
    selected,
    onToggle,
    onClear,
    checkState = (value) => (selected.includes(value) ? 'checked' : 'unchecked'),
    searchable = false,
    searchPlaceholder = 'Search…',
    onSearchChange,
    loading = false,
    error = false,
    onRetry,
    note,
    max,
    side = 'bottom',
    focusSearchOnOpen = true,
    onBack
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [search, setSearch] = useState('');
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const highlighted = useRef<string | undefined>(undefined);

    const query = onSearchChange ? '' : search.trim().toLowerCase();
    const rows = useMemo(() => buildRows(options, expanded, query), [options, expanded, query]);
    const values = useMemo(() => rows.map((row) => row.option.value), [rows]);
    const labels = useMemo(() => new Map(rows.map((row) => [row.option.value, row.option.label])), [rows]);
    const maxed = max !== undefined && selected.length >= max;

    const handleOpenChange = (next: boolean) => {
        if (next) {
            setExpanded(new Set(options.filter((option) => checkState(option.value) === 'indeterminate').map((option) => option.value)));
        } else {
            setSearch('');
            onSearchChange?.('');
        }
        onOpenChange(next);
    };

    const setGroupOpen = (value: string, groupOpen: boolean) => {
        setExpanded((current) => {
            const next = new Set(current);
            if (groupOpen) {
                next.add(value);
            } else {
                next.delete(value);
            }
            return next;
        });
    };

    return (
        <Combobox.Root
            multiple
            items={values}
            filter={null}
            value={selected}
            onValueChange={(next: string[]) => {
                const toggled = next.find((value) => !selected.includes(value)) ?? selected.find((value) => !next.includes(value));
                if (toggled) {
                    onToggle(toggled);
                }
            }}
            itemToStringLabel={(value: string) => labels.get(value) ?? value}
            inputValue={search}
            onInputValueChange={(value) => {
                setSearch(value);
                onSearchChange?.(value);
            }}
            open={open}
            onOpenChange={handleOpenChange}
            onItemHighlighted={(value) => {
                highlighted.current = value;
            }}
        >
            {trigger && <Combobox.Trigger render={trigger} />}
            <Combobox.Portal>
                <Combobox.Positioner
                    anchor={trigger ? undefined : anchor}
                    side={side}
                    align="start"
                    sideOffset={4}
                    alignOffset={side === 'right' ? -SIDE_PANE_ALIGN_OFFSET : 0}
                    className="isolate z-50"
                >
                    <Combobox.Popup
                        initialFocus={focusSearchOnOpen}
                        onPointerEnter={focusSearchOnOpen ? undefined : () => inputRef.current?.focus()}
                        className="flex max-h-[min(26rem,var(--available-height))] w-max min-w-56 max-w-96 flex-col overflow-hidden rounded-ds-sm border-ds-1 border-border-default bg-surface-overlay shadow-md outline-none"
                    >
                        <div className={cn('flex h-8 shrink-0 items-center gap-1.5 border-b border-border-muted px-2', !searchable && 'sr-only')}>
                            <Search className="size-3.5 shrink-0 text-icon-secondary" />
                            <Combobox.Input
                                ref={inputRef}
                                aria-label={searchable ? `Search ${label.toLowerCase()}` : label}
                                placeholder={searchPlaceholder}
                                className="min-w-0 flex-1 bg-transparent text-ds-sm text-text-strong outline-none placeholder:text-text-placeholder"
                                onKeyDown={(e) => {
                                    if (onBack && e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) {
                                        e.preventDefault();
                                        onBack();
                                        return;
                                    }
                                    const group = highlighted.current;
                                    if (!group || search || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) {
                                        return;
                                    }
                                    const row = rows.find((r) => r.option.value === group);
                                    if (row?.expandable) {
                                        e.preventDefault();
                                        setGroupOpen(group, e.key === 'ArrowRight');
                                    }
                                }}
                            />
                            {loading && <Spinner className="size-3.5 text-icon-secondary" />}
                        </div>
                        {maxed && <div className="px-3 py-1.5 text-ds-xs text-text-warning">Up to {max} values</div>}
                        <Combobox.List className="min-h-0 flex-1 overflow-y-auto p-1">
                            {rows.map(({ option, depth, expandable }) => {
                                const state = checkState(option.value);
                                const groupOpen = expanded.has(option.value) || Boolean(query);
                                return (
                                    <Combobox.Item
                                        key={option.value}
                                        value={option.value}
                                        disabled={maxed && state === 'unchecked'}
                                        className={cn(ROW, depth === 1 && 'pl-8 text-text-secondary')}
                                    >
                                        {expandable && (
                                            <span
                                                aria-hidden
                                                className="-ml-1 flex size-4 shrink-0 items-center justify-center rounded-ds-xs text-icon-secondary hover:bg-state-hover"
                                                onPointerDown={(e) => e.stopPropagation()}
                                                onPointerUp={(e) => e.stopPropagation()}
                                                onMouseUp={(e) => e.stopPropagation()}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setGroupOpen(option.value, !groupOpen);
                                                }}
                                            >
                                                <ChevronRight className={cn('size-3 transition-transform duration-100', groupOpen && 'rotate-90')} />
                                            </span>
                                        )}
                                        {!expandable && depth === 0 && options.some((o) => o.children?.length) && <span className="-ml-1 size-4 shrink-0" />}
                                        {option.icon}
                                        <span
                                            className={cn(
                                                'truncate',
                                                option.mono && 'font-mono text-ds-xs',
                                                state !== 'unchecked' && 'font-ds-medium text-text-strong'
                                            )}
                                        >
                                            {option.label}
                                        </span>
                                        {/* `option` can't carry aria-expanded, so the group and partial states are read out as text. */}
                                        {(expandable || state === 'indeterminate') && (
                                            <span className="sr-only">
                                                {state === 'indeterminate' && ', partly selected'}
                                                {expandable && (groupOpen ? ', expanded' : ', collapsed')}
                                            </span>
                                        )}
                                        <CheckMark state={state} />
                                    </Combobox.Item>
                                );
                            })}
                            {rows.length === 0 && <EmptyState loading={loading} error={error} searching={Boolean(search.trim())} onRetry={onRetry} />}
                        </Combobox.List>
                        {note && rows.length > 0 && <div className="shrink-0 px-3 pb-1.5 text-ds-xs text-text-muted">{note}</div>}
                        {selected.length > 0 && (
                            <div className="flex shrink-0 items-center justify-between border-t border-border-muted px-2 py-1.5">
                                <LinkButton tone="accent" size="sm" onClick={onClear}>
                                    Clear
                                </LinkButton>
                                <span className="text-ds-xs text-text-muted">{selected.length} selected</span>
                            </div>
                        )}
                    </Combobox.Popup>
                </Combobox.Positioner>
            </Combobox.Portal>
        </Combobox.Root>
    );
};
