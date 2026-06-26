import { Combobox, Popover } from '@base-ui/react';
import { Check, ChevronRight } from 'lucide-react';
import { forwardRef, useEffect, useRef, useState } from 'react';

import { Spinner } from '@/components/ui/Spinner';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/utils/utils';

/**
 * A grouped, searchable single-value filter — a trigger button opens a list of GROUPS
 * (e.g. dimensions); hovering/opening a group reveals an adjacent, searchable list of its
 * OPTIONS (à la Linear). Picking an option commits `group:value` and closes everything.
 *
 * Built on Base UI: the outer is a non-modal `Popover` (it doesn't trap or rove focus, so the
 * nested value pane can take focus freely) and each group's value pane is a `Combobox` (listbox
 * a11y + keyboard nav for free). Because both are Base UI, the value pane registers as a nested
 * layer of the outer popover, so focusing/typing in it doesn't dismiss the outer.
 *
 * Keyboard: ↓ on the trigger opens; ↑/↓ move between groups; →/Enter open a group's pane and focus
 * its search; ← returns from the pane to its group; Esc closes everything. The search is focused
 * only when a pane is opened via keyboard, or once the pointer enters the pane — never on mere
 * hover-open, so moving the cursor from a group to its values can't slip onto another group and
 * reset the list.
 *
 * Per-group options are loaded lazily via the injected `useGroupData` hook — it's only called from
 * the value pane, which mounts when (and remounts each time) a group opens. This keeps the
 * component app-agnostic: a consumer wires it to its own data source (and a story to static data).
 */
export interface FilterSelectGroup {
    value: string;
    label: string;
}

export interface FilterSelectOption {
    value: string;
    label: string;
}

export interface FilterSelectGroupData {
    options: FilterSelectOption[];
    isLoading: boolean;
    isError: boolean;
    // A background fetch is in flight while previous results stay shown (e.g. a debounced search
    // refetch keeping prior data). Drives an inline spinner in the search box so typing has visible
    // feedback. Distinct from `isLoading` (first load, blank list) — leave unset for sync data.
    isFetching?: boolean;
    // Optional incremental paging for long value lists. When `fetchNextPage` is
    // provided, the value pane loads the next page as it nears the bottom on
    // scroll (and shows a spinner while `isFetchingNextPage`). Consumers that
    // return their whole set at once leave these unset.
    hasNextPage?: boolean;
    isFetchingNextPage?: boolean;
    fetchNextPage?: () => void;
}

/** A value-pane row: a real option, or the synthetic free-text "create" row appended after matches. */
interface PaneItem extends FilterSelectOption {
    isCreate?: boolean;
}

interface FilterSelectProps {
    /** The trigger element (Base UI clones it via `render`). */
    trigger: React.ReactElement;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    groups: readonly FilterSelectGroup[];
    /**
     * Hook the value pane calls to load a group's options (mounts per open group).
     * Receives the pane's debounced `search` term so the consumer can filter the
     * full set server-side; consumers that filter client-side can ignore it (the
     * pane still narrows the loaded list by the live input).
     */
    useGroupData: (group: string, opts: { search: string }) => FilterSelectGroupData;
    /** The currently-applied value for a group, if any — drives the check next to the group. */
    selectedValueFor?: (group: string) => string | null;
    onSelect: (group: string, value: string) => void;
    /**
     * Allow committing a typed value that isn't in the list (e.g. a long-tail value hidden in 'Rest').
     * Pass a predicate to decide per group — e.g. off for groups whose values are a fixed, fully-listed set.
     */
    allowCreate?: boolean | ((group: string) => boolean);
    /**
     * Whether a group's value pane shows a search box. Off for closed, fully-listed sets (e.g.
     * Status, Environment) where the short list needs no filtering. Pass a predicate to decide per
     * group. Defaults to true. Independent of `allowCreate` — a list can be searchable without
     * accepting typed-but-unlisted values (e.g. when search already covers the full set).
     */
    searchable?: boolean | ((group: string) => boolean);
    searchPlaceholder?: string;
    /** Called when a group's pane opens — e.g. to prefetch. */
    onOpenGroup?: (group: string) => void;
}

const VALUE_ITEM =
    'relative flex h-7 w-full cursor-pointer items-center gap-2 rounded-sm py-1 pr-8 pl-2 text-body-medium-regular text-text-secondary whitespace-nowrap outline-hidden select-none data-highlighted:bg-state-hover data-highlighted:text-text-strong';

/** One value-pane row: a real option (with its selected check), or the free-text "create" row. */
const ValueRow: React.FC<{ item: PaneItem }> = ({ item }) =>
    item.isCreate ? (
        <Combobox.Item value={item} className={VALUE_ITEM}>
            <span className="flex min-w-0 items-center gap-1">
                <span className="shrink-0 text-text-muted">Filter to</span>
                <span className="truncate text-text-strong">&quot;{item.label}&quot;</span>
            </span>
        </Combobox.Item>
    ) : (
        <Combobox.Item value={item} className={VALUE_ITEM}>
            <span>{item.label}</span>
            <Combobox.ItemIndicator className="absolute right-2 flex size-3.5 items-center justify-center text-text-muted">
                <Check className="size-3.5" />
            </Combobox.ItemIndicator>
        </Combobox.Item>
    );

const FilterValuePane: React.FC<{
    anchor: React.RefObject<HTMLElement | null>;
    group: string;
    useGroupData: (group: string, opts: { search: string }) => FilterSelectGroupData;
    selectedValue: string | null;
    allowCreate: boolean;
    searchable: boolean;
    searchPlaceholder: string;
    /** Focus the search on mount — true only when the pane was opened via keyboard. */
    autoFocus: boolean;
    onSelect: (value: string) => void;
    /** ← / pointer-leave-back: close the pane and return focus to its group row. */
    onBack: () => void;
    /** Esc: close the whole filter. */
    onCloseAll: () => void;
}> = ({ anchor, group, useGroupData, selectedValue, allowCreate, searchable, searchPlaceholder, autoFocus, onSelect, onBack, onCloseAll }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [inputValue, setInputValue] = useState('');
    // Debounce the typed term before handing it to the consumer's data hook so a
    // server-backed `useGroupData` isn't re-queried on every keystroke; the pane's
    // own Base UI filtering still narrows the loaded list instantly as you type.
    const debouncedSearch = useDebouncedValue(inputValue.trim(), 300);
    const { options, isLoading, isError, isFetching, hasNextPage, isFetchingNextPage, fetchNextPage } = useGroupData(group, { search: debouncedSearch });

    // Spinner in the search box while a search is pending — the debounce window (input ahead of the
    // queried term) then the fetch — but not the first load or next-page (they have their own).
    const searchPending = inputValue.trim() !== debouncedSearch;
    const searching = searchable && !isLoading && (searchPending || (Boolean(isFetching) && !isFetchingNextPage));

    // Page when the list nears the bottom. A scroll-position check beats an IntersectionObserver
    // sentinel here: in this short, portalled overflow pane a viewport-rooted observer never fires.
    const onListScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (!fetchNextPage || isFetchingNextPage || !hasNextPage) return;
        const el = e.currentTarget;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) fetchNextPage();
    };

    // Focus the search only when opened via keyboard. On hover-open we defer to the popup's
    // onPointerEnter, so moving the cursor across the group list can't reset a filtered list.
    useEffect(() => {
        if (!autoFocus) return;
        const id = requestAnimationFrame(() => inputRef.current?.focus());
        return () => cancelAnimationFrame(id);
    }, [autoFocus]);

    const trimmed = inputValue.trim();
    const q = trimmed.toLowerCase();
    // We filter ourselves (Base UI's own filter is disabled below) so the synthetic "create" row
    // can be appended after the matches as a real, keyboard-navigable item — not a mouse-only
    // button sitting outside the list, which arrow keys could never reach.
    const matches = options.filter((o) => o.label.toLowerCase().includes(q));
    const hasMatches = matches.length > 0;
    const showCreate = allowCreate && trimmed.length > 0 && !options.some((o) => o.value === trimmed);
    const items: PaneItem[] = showCreate ? [...matches, { value: trimmed, label: trimmed, isCreate: true }] : matches;
    const selectedOption = options.find((o) => o.value === selectedValue) ?? null;

    // When `searchable` is false (a fixed, fully-listed set like Status or Environment) the pane
    // shows just the short list. The input stays mounted but visually hidden (below) so the combobox
    // keeps driving keyboard navigation (arrows, Enter, ←/Esc) the same way.

    return (
        <Combobox.Root
            items={items}
            // We pre-filter and append the create row ourselves; null disables Base UI's filtering
            // so it renders exactly these items, the create row included.
            filter={null}
            value={selectedOption}
            // The picked item's value is what we commit — for the create row, the typed text.
            onValueChange={(item: PaneItem | null) => item && onSelect(item.value)}
            inputValue={inputValue}
            onInputValueChange={setInputValue}
            open
            // Highlight the first item so Enter commits it (a match if any, otherwise the create row).
            autoHighlight
        >
            <Combobox.Portal>
                {/* alignOffset lifts the pane so its first value row lines up with the open group row.
                    With the search shown it sits one row (~36px) above the first value, so the offset
                    is larger; without a search the first value is at the top. */}
                <Combobox.Positioner anchor={anchor} side="right" align="start" sideOffset={4} alignOffset={searchable ? -41 : -5} className="isolate z-50">
                    <Combobox.Popup
                        // Don't grab focus on open (Base UI Combobox would focus the input by default).
                        // We focus the search only on keyboard-open (autoFocus effect) or pointer-enter.
                        initialFocus={false}
                        // Focus the search when the pointer enters the pane; blur it when the pointer
                        // leaves, so the search isn't held focused once you've moved off the pane.
                        onPointerEnter={() => inputRef.current?.focus()}
                        onPointerLeave={() => inputRef.current?.blur()}
                        className="relative flex w-fit min-w-[14rem] max-w-[32rem] flex-col rounded border border-border-muted bg-surface-overlay p-1 text-text-secondary shadow-md outline-hidden"
                    >
                        <Combobox.Input
                            ref={inputRef}
                            placeholder={searchPlaceholder}
                            onKeyDown={(e) => {
                                // Enter commits the highlighted item (a match or the create row) — Base UI
                                // handles it via autoHighlight, so it isn't special-cased here.
                                if (e.key === 'Escape') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onCloseAll();
                                } else if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) {
                                    // At the start of the input, ← steps back to the group list.
                                    e.preventDefault();
                                    onBack();
                                }
                            }}
                            className={cn(
                                searchable
                                    ? 'mb-1 h-8 w-full rounded border-[0.5px] border-border-muted bg-surface-canvas pr-8 pl-2.5 text-body-medium-regular text-text-strong outline-none placeholder:text-text-muted'
                                    : 'sr-only'
                            )}
                        />
                        {/* Search spinner, overlaid at the input's right (the popup is the positioning context). */}
                        {searching && (
                            <span className="pointer-events-none absolute top-1 right-2.5 flex h-8 items-center">
                                <Spinner className="size-3.5 text-text-muted" />
                            </span>
                        )}
                        <Combobox.List className="max-h-[50vh] overflow-y-auto" onScroll={onListScroll}>
                            {isLoading ? (
                                <div className="flex justify-center py-3">
                                    <Spinner />
                                </div>
                            ) : (
                                <>
                                    <Combobox.Collection>
                                        {(item: PaneItem) => <ValueRow key={item.isCreate ? '__create' : item.value} item={item} />}
                                    </Combobox.Collection>
                                    {!hasMatches && !showCreate && (
                                        <div className="px-2 py-3 text-center text-text-muted text-body-small-regular">
                                            {isError ? 'Failed to load values' : 'No values'}
                                        </div>
                                    )}
                                    {isFetchingNextPage && (
                                        <div className="flex justify-center py-2">
                                            <Spinner />
                                        </div>
                                    )}
                                </>
                            )}
                        </Combobox.List>
                    </Combobox.Popup>
                </Combobox.Positioner>
            </Combobox.Portal>
        </Combobox.Root>
    );
};

const GROUP_ROW =
    'flex h-7 w-full cursor-pointer items-center gap-2 rounded-sm px-2 text-body-medium-regular text-text-secondary outline-hidden hover:bg-state-hover hover:text-text-strong focus-visible:bg-state-hover focus-visible:text-text-strong';

/**
 * A dimension row in the outer list. Hover / click / → / Enter open its value pane (keyboard-open
 * focuses the pane's search via the `viaKeyboard` flag); ↑/↓ rove between rows via `onMove`.
 */
const GroupRow = forwardRef<
    HTMLButtonElement,
    {
        group: FilterSelectGroup;
        isSelected: boolean;
        isOpen: boolean;
        onOpen: (el: HTMLButtonElement, viaKeyboard: boolean) => void;
        onMove: (el: HTMLButtonElement, dir: 1 | -1) => void;
    }
>(({ group, isSelected, isOpen, onOpen, onMove }, ref) => (
    <button
        ref={ref}
        type="button"
        data-group={group.value}
        onPointerEnter={(e) => onOpen(e.currentTarget, false)}
        onMouseEnter={(e) => onOpen(e.currentTarget, false)}
        onClick={(e) => onOpen(e.currentTarget, false)}
        onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                onMove(e.currentTarget, 1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                onMove(e.currentTarget, -1);
            } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
                e.preventDefault();
                onOpen(e.currentTarget, true);
            }
        }}
        className={cn(GROUP_ROW, isOpen && 'bg-state-hover text-text-strong')}
    >
        <span className="flex-1 truncate text-left">{group.label}</span>
        {isSelected && <Check className="size-3.5 shrink-0 text-text-muted" />}
        <ChevronRight className="size-4 shrink-0 text-text-muted" />
    </button>
));
GroupRow.displayName = 'GroupRow';

export const FilterSelect: React.FC<FilterSelectProps> = ({
    trigger,
    open,
    onOpenChange,
    groups,
    useGroupData,
    selectedValueFor,
    onSelect,
    allowCreate = false,
    searchable = true,
    searchPlaceholder = 'Search…',
    onOpenGroup
}) => {
    // Which group's value pane is open, the row it anchors to, and whether it was opened via
    // keyboard (→/Enter) — which decides whether the pane focuses its search on mount.
    const [openGroup, setOpenGroup] = useState<string | null>(null);
    const [openViaKeyboard, setOpenViaKeyboard] = useState(false);
    const anchorRef = useRef<HTMLElement | null>(null);
    const firstGroupRef = useRef<HTMLButtonElement>(null);

    const reset = () => {
        setOpenGroup(null);
        setOpenViaKeyboard(false);
    };
    const openSubmenu = (group: string, el: HTMLElement, viaKeyboard = false) => {
        if (group === openGroup) return;
        anchorRef.current = el;
        setOpenViaKeyboard(viaKeyboard);
        setOpenGroup(group);
        onOpenGroup?.(group);
    };
    const back = () => {
        reset();
        anchorRef.current?.focus();
    };
    const closeAll = () => {
        onOpenChange(false);
        reset();
    };
    // Roving ↑/↓ between group rows.
    const moveGroup = (current: HTMLElement, dir: 1 | -1) => {
        const rows = Array.from(current.parentElement?.querySelectorAll<HTMLButtonElement>('[data-group]') ?? []);
        const i = rows.indexOf(current as HTMLButtonElement);
        rows[(i + dir + rows.length) % rows.length]?.focus();
    };

    return (
        <Popover.Root
            open={open}
            onOpenChange={(next) => {
                onOpenChange(next);
                if (!next) reset();
            }}
            // Non-modal so the nested value pane (a Combobox) can hold focus without the
            // outer trapping it; both being Base UI, the pane counts as a nested layer.
            modal={false}
        >
            <Popover.Trigger
                render={trigger}
                // ↓ opens the menu when the (closed) trigger is focused, like a native select.
                onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' && !open) {
                        e.preventDefault();
                        onOpenChange(true);
                    }
                }}
            />
            <Popover.Portal>
                <Popover.Positioner side="bottom" align="end" sideOffset={4} className="z-50">
                    <Popover.Popup
                        // Land focus on the first group so ↑/↓ work immediately on open.
                        initialFocus={firstGroupRef}
                        className="flex w-52 flex-col rounded border border-border-muted bg-surface-overlay p-1 text-text-secondary shadow-md outline-hidden"
                    >
                        {groups.map((g, i) => (
                            <GroupRow
                                key={g.value}
                                ref={i === 0 ? firstGroupRef : undefined}
                                group={g}
                                isSelected={(selectedValueFor?.(g.value) ?? null) !== null}
                                isOpen={openGroup === g.value}
                                onOpen={(el, viaKeyboard) => openSubmenu(g.value, el, viaKeyboard)}
                                onMove={moveGroup}
                            />
                        ))}
                        {openGroup !== null && (
                            <FilterValuePane
                                key={openGroup}
                                anchor={anchorRef}
                                group={openGroup}
                                useGroupData={useGroupData}
                                selectedValue={selectedValueFor?.(openGroup) ?? null}
                                allowCreate={typeof allowCreate === 'function' ? allowCreate(openGroup) : allowCreate}
                                searchable={typeof searchable === 'function' ? searchable(openGroup) : searchable}
                                searchPlaceholder={searchPlaceholder}
                                autoFocus={openViaKeyboard}
                                onSelect={(value) => {
                                    onSelect(openGroup, value);
                                    onOpenChange(false);
                                    reset();
                                }}
                                onBack={back}
                                onCloseAll={closeAll}
                            />
                        )}
                    </Popover.Popup>
                </Popover.Positioner>
            </Popover.Portal>
        </Popover.Root>
    );
};
