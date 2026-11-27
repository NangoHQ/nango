import { Combobox } from '@base-ui/react';
import { CheckIcon, ChevronRight, MinusIcon, Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { LinkButton } from '@nangohq/design-system';

import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/utils/utils';
import { checkboxVariants } from './Checkbox';

export interface FilterMenuOption {
    value: string;
    label: string;
    icon?: React.ReactNode;
    mono?: boolean;
    children?: FilterMenuOption[];
}

export type FilterCheckState = 'checked' | 'indeterminate' | 'unchecked';

export interface FilterMenuProps {
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
    max?: number;
}

interface Row {
    option: FilterMenuOption;
    depth: 0 | 1;
    expandable: boolean;
}

const ROW =
    'flex h-7 w-full cursor-pointer items-center gap-2 rounded-ds-xs px-2 text-ds-sm text-text-secondary outline-none select-none data-highlighted:bg-state-hover data-highlighted:text-text-strong data-disabled:cursor-not-allowed data-disabled:opacity-50';

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
    <span data-state={state} className={cn(checkboxVariants({ size: 'sm' }), 'group/checkbox pointer-events-none')}>
        {state === 'checked' && <CheckIcon strokeWidth={2} />}
        {state === 'indeterminate' && <MinusIcon strokeWidth={2} />}
    </span>
);

export const FilterMenu: React.FC<FilterMenuProps> = ({
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
    max
}) => {
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
                <Combobox.Positioner anchor={trigger ? undefined : anchor} side="bottom" align="start" sideOffset={4} className="isolate z-50">
                    <Combobox.Popup className="flex max-h-[min(26rem,var(--available-height))] w-max min-w-56 max-w-96 flex-col overflow-hidden rounded-ds-sm border-ds-1 border-border-default bg-surface-overlay shadow-md outline-none">
                        <div className={cn('flex h-8 shrink-0 items-center gap-1.5 border-b border-border-muted px-2', !searchable && 'sr-only')}>
                            <Search className="size-3.5 shrink-0 text-icon-secondary" />
                            <Combobox.Input
                                placeholder={searchPlaceholder}
                                className="min-w-0 flex-1 bg-transparent text-ds-sm text-text-strong outline-none placeholder:text-text-placeholder"
                                onKeyDown={(e) => {
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
                                        className={cn(ROW, depth === 1 && 'pl-8')}
                                        aria-expanded={expandable ? groupOpen : undefined}
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
                                        <CheckMark state={state} />
                                        {option.icon}
                                        <span className={cn('truncate', option.mono && 'font-mono text-ds-xs', state !== 'unchecked' && 'text-text-strong')}>
                                            {option.label}
                                        </span>
                                    </Combobox.Item>
                                );
                            })}
                            {rows.length === 0 && !loading && <div className="px-2 py-3 text-center text-ds-xs text-text-muted">No matches</div>}
                        </Combobox.List>
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
