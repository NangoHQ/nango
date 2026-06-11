import { Check, Search, XCircle } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/InputGroup';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/utils/utils';

export interface FilterOption<T extends string = string> {
    label: string;
    value: T;
    children?: { label: string; value: T }[];
}

interface FilterMultiSelectProps<T extends string = string> {
    label: string;
    options: FilterOption<T>[];
    selected: T[];
    defaultSelect?: T[];
    onChange: (selected: T[]) => void;
    showSearch?: boolean;
    onSearchChange?: (search: string) => void;
    loading?: boolean;
    max?: number;
    width?: string;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export function FilterMultiSelect<T extends string = string>({
    label,
    options,
    selected,
    defaultSelect = [],
    onChange,
    showSearch = false,
    onSearchChange,
    loading = false,
    max,
    width = 'w-56',
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange
}: FilterMultiSelectProps<T>) {
    const [internalOpen, setInternalOpen] = useState(false);
    const [search, setSearch] = useState('');
    const listboxRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : internalOpen;

    const setOpen = useCallback(
        (val: boolean) => {
            if (isControlled) {
                controlledOnOpenChange?.(val);
            } else {
                setInternalOpen(val);
            }
            if (!val) setSearch('');
        },
        [isControlled, controlledOnOpenChange]
    );

    const handleSearchChange = (value: string) => {
        setSearch(value);
        onSearchChange?.(value);
    };

    const filteredOptions = useMemo(() => {
        if (!search.trim() || onSearchChange) return options;
        const q = search.toLowerCase();
        return options.reduce<FilterOption<T>[]>((acc, opt) => {
            if (opt.label.toLowerCase().includes(q)) {
                acc.push(opt);
            } else if (opt.children) {
                const matched = opt.children.filter((c) => c.label.toLowerCase().includes(q));
                if (matched.length) acc.push({ ...opt, children: matched });
            }
            return acc;
        }, []);
    }, [options, search, onSearchChange]);

    const select = useCallback(
        (val: T) => {
            if (val === 'all') {
                onChange(['all'] as T[]);
                return;
            }
            const isSelected = selected.includes(val);
            const maxed = max !== undefined && selected.filter((s) => s !== 'all').length >= max;
            if (max && !isSelected && maxed) return;

            let tmp = isSelected ? selected.filter((s) => s !== val) : [...selected, val];

            if (!isSelected) {
                const parentOpt = options.find((o) => o.value === val);
                const parentOfVal = options.find((o) => o.children?.some((c) => c.value === val));
                if (parentOpt?.children?.length) {
                    const childValues = new Set(parentOpt.children.map((c) => c.value));
                    tmp = tmp.filter((s) => !childValues.has(s));
                } else if (parentOfVal) {
                    tmp = tmp.filter((s) => s !== parentOfVal.value);
                }
            }

            if (tmp.length > 1) tmp = tmp.filter((s) => s !== 'all');
            onChange(tmp.length <= 0 ? [...defaultSelect] : tmp);
        },
        [selected, options, onChange, defaultSelect, max]
    );

    const reset = (e: React.PointerEvent | React.KeyboardEvent) => {
        e.preventDefault();
        onChange([...defaultSelect]);
    };

    const isDirty = useMemo(() => {
        if (defaultSelect.length === 0) return selected.length > 0;
        return selected.length !== defaultSelect.length || selected.some((s, i) => s !== defaultSelect[i]);
    }, [selected, defaultSelect]);

    const isMaxed = max !== undefined && selected.filter((s) => s !== 'all').length >= max;

    const handleListboxKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="option"]:not([aria-disabled="true"])'));
        const idx = items.indexOf(document.activeElement as HTMLElement);
        if (e.key === 'ArrowDown') {
            const next = items[idx + 1] ?? items[0];
            next?.focus();
        } else {
            if (idx <= 0 && showSearch) {
                searchInputRef.current?.focus();
            } else {
                items[Math.max(idx - 1, 0)]?.focus();
            }
        }
    };

    const renderOption = (opt: FilterOption<T>, indent = false) => {
        const isSelected = selected.includes(opt.value);
        const disabled = max !== undefined && !isSelected && isMaxed && opt.value !== 'all';
        return (
            <div
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                aria-disabled={disabled || undefined}
                tabIndex={disabled ? -1 : 0}
                className={cn(
                    'relative flex items-center py-1.5 pl-8 pr-2 text-sm select-none outline-none',
                    indent && 'ml-4',
                    disabled
                        ? 'opacity-50 pointer-events-none text-gray-400'
                        : 'cursor-pointer text-gray-400 hover:bg-pure-black hover:text-white focus:bg-pure-black focus:text-white',
                    isSelected && 'text-white bg-pure-black'
                )}
                onClick={() => select(opt.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        select(opt.value);
                    }
                }}
            >
                <span
                    className={cn(
                        'absolute left-2 flex h-3.5 w-3.5 items-center justify-center border border-neutral-700 rounded-xs',
                        isSelected && 'border-transparent'
                    )}
                >
                    {isSelected && <Check className="h-5 w-5" />}
                </span>
                <span className="min-w-0 truncate">{opt.label}</span>
            </div>
        );
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn('h-9 text-text-light-gray', isDirty && 'text-white')}>
                    {label}
                    {isDirty && (
                        <span
                            role="button"
                            tabIndex={-1}
                            className="bg-pure-black text-white flex gap-1 items-center px-1.5 rounded-xl"
                            onPointerDown={reset}
                            onKeyDown={(e) => {
                                if (['Enter', ' '].includes(e.key)) reset(e);
                            }}
                        >
                            <XCircle size={14} />
                            {selected.length}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className={cn('p-2 text-white bg-active-gray', width)} align="end">
                {showSearch && (
                    <div className="pb-2">
                        <InputGroup className="bg-active-gray border-grayscale-600">
                            <InputGroupAddon>
                                <Search className="w-4 h-4" />
                            </InputGroupAddon>
                            <InputGroupInput
                                ref={searchInputRef}
                                placeholder="Search..."
                                value={search}
                                onChange={(e) => handleSearchChange(e.target.value)}
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        listboxRef.current?.querySelector<HTMLElement>('[role="option"]:not([aria-disabled="true"])')?.focus();
                                    }
                                }}
                            />
                            {loading && (
                                <InputGroupAddon align="inline-end">
                                    <Spinner />
                                </InputGroupAddon>
                            )}
                        </InputGroup>
                    </div>
                )}
                {isMaxed && <div className="px-3 py-1.5 text-xs text-amber-500 border-b border-grayscale-700">Can&apos;t select more filters</div>}
                <div ref={listboxRef} role="listbox" className="max-h-[415px] overflow-y-auto" onKeyDown={handleListboxKeyDown}>
                    {filteredOptions.map((opt) => (
                        <div key={opt.value}>
                            {renderOption(opt)}
                            {opt.children?.map((child) => renderOption(child, true))}
                        </div>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
}
