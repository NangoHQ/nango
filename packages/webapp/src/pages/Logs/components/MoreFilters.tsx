import { Popover } from '@base-ui/react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useRef, useState } from 'react';

import { Button } from '@nangohq/design-system';

import { CountBadge } from '@/components/ui/CountBadge';
import { cn } from '@/utils/utils';
import { usePrefetchSearchFilters } from '../../../hooks/useLogs';
import { useStore } from '../../../store';
import { RemoteFilterMenu } from './RemoteFilterMenu';

import type { SearchFiltersCategory } from '@nangohq/types';

export interface MoreFilter {
    key: string;
    label: string;
    category: SearchFiltersCategory;
    selected: string[];
    onChange: (selected: string[]) => void;
}

const ROW =
    'flex h-7 w-full cursor-pointer items-center gap-2 rounded-ds-xs px-2 text-left text-ds-sm text-text-default outline-none select-none hover:bg-state-hover hover:text-text-strong focus-visible:bg-state-hover focus-visible:text-text-strong';

export const MoreFilters: React.FC<{ filters: MoreFilter[] }> = ({ filters }) => {
    const prefetch = usePrefetchSearchFilters(useStore((state) => state.env));
    const [open, setOpen] = useState(false);
    const [openKey, setOpenKey] = useState<string | null>(null);
    const [viaKeyboard, setViaKeyboard] = useState(false);
    const [keyboardOpens, setKeyboardOpens] = useState(0);
    const anchorRef = useRef<HTMLElement | null>(null);
    const firstRowRef = useRef<HTMLButtonElement>(null);

    const setCount = filters.filter((filter) => filter.selected.length > 0).length;
    const openFilter = filters.find((filter) => filter.key === openKey);

    const openPane = (key: string, row: HTMLElement, keyboard: boolean) => {
        if (key === openKey && !keyboard) {
            return;
        }
        anchorRef.current = row;
        setViaKeyboard(keyboard);
        setOpenKey(key);
        if (keyboard) {
            setKeyboardOpens((count) => count + 1);
        }
    };
    const closePane = () => {
        setOpenKey(null);
        anchorRef.current?.focus();
    };
    const moveRow = (row: HTMLElement, step: 1 | -1) => {
        const rows = Array.from(row.parentElement?.querySelectorAll<HTMLButtonElement>('[data-filter-row]') ?? []);
        rows[(rows.indexOf(row as HTMLButtonElement) + step + rows.length) % rows.length]?.focus();
    };

    return (
        <Popover.Root
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (next) {
                    filters.forEach((filter) => prefetch(filter.category));
                } else {
                    setOpenKey(null);
                }
            }}
            // Non-modal so the side pane's search can take focus without the list trapping it.
            modal={false}
        >
            <Popover.Trigger
                render={
                    <Button variant="outline-filled" size="sm">
                        More filters
                        {setCount > 0 && <CountBadge count={setCount} />}
                        <ChevronDown className="size-3 text-icon-secondary" />
                    </Button>
                }
                onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' && !open) {
                        e.preventDefault();
                        setOpen(true);
                    }
                }}
            />
            <Popover.Portal>
                <Popover.Positioner side="bottom" align="start" sideOffset={4} className="isolate z-50">
                    <Popover.Popup
                        initialFocus={firstRowRef}
                        className="flex min-w-56 max-w-80 flex-col rounded-ds-sm border-ds-1 border-border-default bg-surface-overlay p-1 shadow-md outline-none"
                    >
                        {filters.map((filter, index) => (
                            <button
                                key={filter.key}
                                ref={index === 0 ? firstRowRef : undefined}
                                type="button"
                                data-filter-row
                                aria-haspopup="listbox"
                                aria-expanded={openKey === filter.key}
                                className={cn(ROW, openKey === filter.key && 'bg-state-hover text-text-strong')}
                                onPointerEnter={(e) => openPane(filter.key, e.currentTarget, false)}
                                onClick={(e) => openPane(filter.key, e.currentTarget, false)}
                                onKeyDown={(e) => {
                                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                                        e.preventDefault();
                                        moveRow(e.currentTarget, e.key === 'ArrowDown' ? 1 : -1);
                                    } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
                                        e.preventDefault();
                                        openPane(filter.key, e.currentTarget, true);
                                    }
                                }}
                            >
                                <span className="shrink-0">{filter.label}</span>
                                <span className="ml-auto shrink-0 text-text-secondary">
                                    {filter.selected.length > 0 && `${filter.selected.length} selected`}
                                </span>
                                <ChevronRight className="size-3 shrink-0 text-icon-secondary" />
                            </button>
                        ))}
                        {openFilter && (
                            <RemoteFilterMenu
                                key={`${openFilter.key}-${keyboardOpens}`}
                                label={openFilter.label}
                                category={openFilter.category}
                                selected={openFilter.selected}
                                onChange={openFilter.onChange}
                                open
                                onOpenChange={(next) => {
                                    if (!next) {
                                        closePane();
                                    }
                                }}
                                anchor={anchorRef}
                                side="right"
                                focusSearchOnOpen={viaKeyboard}
                                onBack={closePane}
                            />
                        )}
                    </Popover.Popup>
                </Popover.Positioner>
            </Popover.Portal>
        </Popover.Root>
    );
};
