import { Check, ChevronsUpDown, Search } from 'lucide-react';
import * as React from 'react';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu';
import { InputGroup, InputGroupAddon, InputGroupInput } from './input-group';
import { cn } from '@/utils/utils';

export interface ComboboxOption<TValue extends string = string> {
    value: TValue;
    label: string;
    filterValue?: string;
    disabled?: boolean;
}

export interface ComboboxProps<TValue extends string = string> {
    value: TValue | '';
    onValueChange: (value: TValue) => void;
    placeholder: string;
    disabled?: boolean;
    options: ComboboxOption<TValue>[];
    searchPlaceholder?: string;
    emptyText?: string;
    renderValue?: (option: ComboboxOption<TValue>) => React.ReactNode;
    renderOption?: (option: ComboboxOption<TValue>, selected: boolean) => React.ReactNode;
    footer?: React.ReactNode;
    className?: string;
    contentClassName?: string;
    searchValue?: string;
    onSearchValueChange?: (value: string) => void;
}

export function Combobox<TValue extends string = string>({
    value,
    onValueChange,
    placeholder,
    disabled,
    options,
    searchPlaceholder = 'Search',
    emptyText = 'No results found.',
    renderValue,
    renderOption,
    footer,
    className,
    contentClassName,
    searchValue,
    onSearchValueChange
}: ComboboxProps<TValue>) {
    const [open, setOpen] = React.useState(false);
    const [internalSearch, setInternalSearch] = React.useState('');
    const search = searchValue !== undefined ? searchValue : internalSearch;

    const selectedOption = React.useMemo(() => {
        if (!value) return undefined;
        return options.find((opt) => opt.value === value);
    }, [options, value]);

    const filteredOptions = React.useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return options;
        return options.filter((opt) => {
            const haystack = (opt.filterValue ?? opt.label).toLowerCase();
            return haystack.includes(q);
        });
    }, [options, search]);

    const setSearch = (next: string) => {
        if (onSearchValueChange) {
            onSearchValueChange(next);
        } else {
            setInternalSearch(next);
        }
    };

    return (
        <DropdownMenu
            open={open}
            onOpenChange={(nextOpen) => {
                setOpen(nextOpen);
                if (!nextOpen) {
                    setSearch('');
                }
            }}
        >
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    disabled={disabled}
                    className={cn(
                        'cursor-pointer flex h-9 w-full min-w-0 items-center justify-between gap-1.5 rounded border border-border-muted bg-dropdown-bg-press px-2 text-s leading-5 outline-none transition-[color,box-shadow] focus-default hover:bg-dropdown-bg-hover disabled:cursor-not-allowed disabled:opacity-50',
                        selectedOption ? 'text-text-secondary' : 'text-text-tertiary',
                        className
                    )}
                >
                    {selectedOption ? (
                        <span className="flex items-center gap-2 min-w-0">
                            {renderValue ? renderValue(selectedOption) : <span className="truncate">{selectedOption.label}</span>}
                        </span>
                    ) : (
                        <span className="truncate">{placeholder}</span>
                    )}
                    <ChevronsUpDown className="size-3 shrink-0 text-text-secondary" />
                </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
                className={cn('z-[70] w-[var(--radix-dropdown-menu-trigger-width)] p-0 overflow-hidden', contentClassName)}
                side="bottom"
                align="start"
                sideOffset={0}
            >
                <div
                    className="p-2 border-b border-border-muted"
                    onKeyDown={(e) => {
                        e.stopPropagation();
                    }}
                >
                    <InputGroup className="bg-bg-surface">
                        <InputGroupInput type="text" placeholder={searchPlaceholder} value={search} onChange={(e) => setSearch(e.target.value)} />
                        <InputGroupAddon>
                            <Search className="size-4 text-text-tertiary" />
                        </InputGroupAddon>
                    </InputGroup>
                </div>

                <div className="p-1 max-h-64 overflow-y-auto">
                    {filteredOptions.length > 0 ? (
                        filteredOptions.map((opt) => {
                            const selected = opt.value === value;
                            return (
                                <DropdownMenuItem
                                    key={opt.value}
                                    disabled={opt.disabled}
                                    onSelect={() => onValueChange(opt.value)}
                                    className="group flex items-center justify-between gap-2 rounded cursor-pointer hover:bg-dropdown-bg-hover hover:text-text-primary"
                                >
                                    <span className="flex items-center gap-2 min-w-0">
                                        {renderOption ? renderOption(opt, selected) : <span className="truncate">{opt.label}</span>}
                                    </span>
                                    {selected && <Check className="size-4 shrink-0" />}
                                </DropdownMenuItem>
                            );
                        })
                    ) : (
                        <div className="px-2 py-3 text-center">
                            <p className="text-text-tertiary text-body-small-regular">{emptyText}</p>
                        </div>
                    )}
                </div>

                {footer ? <div className="border-t border-border-muted px-2 py-2">{footer}</div> : null}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
