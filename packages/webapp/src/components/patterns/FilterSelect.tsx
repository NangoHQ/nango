import { Combobox, Popover } from '@base-ui/react';
import { Check, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Spinner } from '@/components/ui/Spinner';
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
}

interface FilterSelectProps {
    /** The trigger element (Base UI clones it via `render`). */
    trigger: React.ReactElement;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    groups: readonly FilterSelectGroup[];
    /** Hook the value pane calls to load a group's options (mounts per open group). */
    useGroupData: (group: string) => FilterSelectGroupData;
    /** The currently-applied value for a group, if any — drives the check next to the group. */
    selectedValueFor?: (group: string) => string | null;
    onSelect: (group: string, value: string) => void;
    /** Allow committing a typed value that isn't in the list (e.g. a long-tail value hidden in 'Rest'). */
    allowCreate?: boolean;
    searchPlaceholder?: string;
    /** Called when a group's pane opens — e.g. to prefetch. */
    onOpenGroup?: (group: string) => void;
}

const VALUE_ITEM =
    'relative flex h-7 w-full cursor-pointer items-center gap-2 rounded-sm py-1 pr-8 pl-2 text-body-medium-regular text-text-secondary whitespace-nowrap outline-hidden select-none data-highlighted:bg-state-hover data-highlighted:text-text-strong';

const FilterValuePane: React.FC<{
    anchor: React.RefObject<HTMLElement | null>;
    group: string;
    useGroupData: (group: string) => FilterSelectGroupData;
    selectedValue: string | null;
    allowCreate: boolean;
    searchPlaceholder: string;
    /** Focus the search on mount — true only when the pane was opened via keyboard. */
    autoFocus: boolean;
    onSelect: (value: string) => void;
    /** ← / pointer-leave-back: close the pane and return focus to its group row. */
    onBack: () => void;
    /** Esc: close the whole filter. */
    onCloseAll: () => void;
}> = ({ anchor, group, useGroupData, selectedValue, allowCreate, searchPlaceholder, autoFocus, onSelect, onBack, onCloseAll }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const { options, isLoading, isError } = useGroupData(group);
    const [inputValue, setInputValue] = useState('');

    // Focus the search only when opened via keyboard. On hover-open we defer to the popup's
    // onPointerEnter, so moving the cursor across the group list can't reset a filtered list.
    useEffect(() => {
        if (!autoFocus) return;
        const id = requestAnimationFrame(() => inputRef.current?.focus());
        return () => cancelAnimationFrame(id);
    }, [autoFocus]);

    const trimmed = inputValue.trim();
    const q = trimmed.toLowerCase();
    // Mirror Base UI's label-based filtering so the empty state matches what's actually shown.
    const hasMatches = options.some((o) => o.label.toLowerCase().includes(q));
    const showCreate = allowCreate && trimmed.length > 0 && !options.some((o) => o.value === trimmed);
    const selectedOption = options.find((o) => o.value === selectedValue) ?? null;

    return (
        <Combobox.Root
            items={options}
            value={selectedOption}
            // The picked item's value is what we commit; null means cleared (not used here).
            onValueChange={(item: FilterSelectOption | null) => item && onSelect(item.value)}
            inputValue={inputValue}
            onInputValueChange={setInputValue}
            open
            // Highlight the first match so Enter commits it (free-text Enter is handled on the input).
            autoHighlight
        >
            <Combobox.Portal>
                {/* alignOffset lifts the pane so its first value row lines up with the open group row,
                    leaving the search sitting one row above it. */}
                <Combobox.Positioner anchor={anchor} side="right" align="start" sideOffset={4} alignOffset={-41} className="isolate z-50">
                    <Combobox.Popup
                        // Don't grab focus on open (Base UI Combobox would focus the input by default).
                        // We focus the search only on keyboard-open (autoFocus effect) or pointer-enter.
                        initialFocus={false}
                        // Focus the search when the pointer enters the pane; blur it when the pointer
                        // leaves, so the search isn't held focused once you've moved off the pane.
                        onPointerEnter={() => inputRef.current?.focus()}
                        onPointerLeave={() => inputRef.current?.blur()}
                        className="flex w-fit min-w-[14rem] max-w-[32rem] flex-col rounded border border-border-muted bg-surface-overlay p-1 text-text-secondary shadow-md outline-hidden"
                    >
                        <Combobox.Input
                            ref={inputRef}
                            placeholder={searchPlaceholder}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    // Commit a typed value with no match. When there IS a match,
                                    // autoHighlight + Base UI handle Enter.
                                    if (allowCreate && trimmed && !hasMatches) {
                                        e.preventDefault();
                                        onSelect(trimmed);
                                    }
                                } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onCloseAll();
                                } else if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) {
                                    // At the start of the input, ← steps back to the group list.
                                    e.preventDefault();
                                    onBack();
                                }
                            }}
                            className="mb-1 h-8 w-full rounded border-[0.5px] border-border-muted bg-surface-canvas px-2.5 text-body-medium-regular text-text-strong outline-none placeholder:text-text-muted"
                        />
                        <Combobox.List className="max-h-[50vh] overflow-y-auto">
                            {isLoading ? (
                                <div className="flex justify-center py-3">
                                    <Spinner />
                                </div>
                            ) : (
                                <>
                                    <Combobox.Collection>
                                        {(item: FilterSelectOption) => (
                                            <Combobox.Item key={item.value} value={item} className={VALUE_ITEM}>
                                                <span>{item.label}</span>
                                                <Combobox.ItemIndicator className="absolute right-2 flex size-3.5 items-center justify-center text-text-muted">
                                                    <Check className="size-3.5" />
                                                </Combobox.ItemIndicator>
                                            </Combobox.Item>
                                        )}
                                    </Combobox.Collection>
                                    {showCreate && (
                                        <button type="button" onClick={() => onSelect(trimmed)} className={VALUE_ITEM}>
                                            <span className="flex min-w-0 items-center gap-1">
                                                <span className="shrink-0 text-text-muted">Filter to</span>
                                                <span className="truncate text-text-strong">&quot;{trimmed}&quot;</span>
                                            </span>
                                        </button>
                                    )}
                                    {!hasMatches && !showCreate && (
                                        <div className="px-2 py-3 text-center text-text-muted text-body-small-regular">
                                            {isError ? 'Failed to load values' : 'No values'}
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

export const FilterSelect: React.FC<FilterSelectProps> = ({
    trigger,
    open,
    onOpenChange,
    groups,
    useGroupData,
    selectedValueFor,
    onSelect,
    allowCreate = false,
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
                        {groups.map((g, i) => {
                            const selected = selectedValueFor?.(g.value) ?? null;
                            return (
                                <button
                                    key={g.value}
                                    ref={i === 0 ? firstGroupRef : undefined}
                                    type="button"
                                    data-group={g.value}
                                    // Hover opens the pane (Linear-style); the guard in openSubmenu makes
                                    // repeat calls a no-op.
                                    onPointerEnter={(e) => openSubmenu(g.value, e.currentTarget)}
                                    onMouseEnter={(e) => openSubmenu(g.value, e.currentTarget)}
                                    onClick={(e) => openSubmenu(g.value, e.currentTarget)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'ArrowDown') {
                                            e.preventDefault();
                                            moveGroup(e.currentTarget, 1);
                                        } else if (e.key === 'ArrowUp') {
                                            e.preventDefault();
                                            moveGroup(e.currentTarget, -1);
                                        } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
                                            // Open via keyboard → the pane focuses its search.
                                            e.preventDefault();
                                            openSubmenu(g.value, e.currentTarget, true);
                                        }
                                    }}
                                    className={cn(
                                        'flex h-7 w-full cursor-pointer items-center gap-2 rounded-sm px-2 text-body-medium-regular text-text-secondary outline-hidden hover:bg-state-hover hover:text-text-strong focus-visible:bg-state-hover focus-visible:text-text-strong',
                                        openGroup === g.value && 'bg-state-hover text-text-strong'
                                    )}
                                >
                                    <span className="flex-1 truncate text-left">{g.label}</span>
                                    {selected !== null && <Check className="size-3.5 shrink-0 text-text-muted" />}
                                    <ChevronRight className="size-4 shrink-0 text-text-muted" />
                                </button>
                            );
                        })}
                        {openGroup !== null && (
                            <FilterValuePane
                                key={openGroup}
                                anchor={anchorRef}
                                group={openGroup}
                                useGroupData={useGroupData}
                                selectedValue={selectedValueFor?.(openGroup) ?? null}
                                allowCreate={allowCreate}
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
