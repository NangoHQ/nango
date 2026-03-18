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
    renderOptionRight?: (option: ComboboxOption<TValue>, selected: boolean) => React.ReactNode;
    footer?: React.ReactNode;
    className?: string;
    contentClassName?: string;
    searchValue?: string;
    onSearchValueChange?: (value: string) => void;
    showCheckbox?: boolean;
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
    renderOptionRight,
    footer,
    className,
    contentClassName,
    searchValue,
    onSearchValueChange,
    showCheckbox = true
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
                        'text-[14px] h-8 cursor-pointer flex w-full min-w-0 items-center justify-between gap-1.5 self-stretch rounded-[4px] bg-bg-surface px-2 py-0 text-body-medium-regular leading-[160%] tracking-normal outline-none transition-[color,box-shadow] focus-default hover:bg-dropdown-bg-hover disabled:cursor-not-allowed disabled:opacity-50',
                        selectedOption ? 'text-text-primary' : 'text-text-secondary',
                        'hover:text-text-primary',
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
                className={cn(
                    'z-[70] flex w-[var(--radix-dropdown-menu-trigger-width)] flex-col items-start overflow-hidden rounded-[4px] border-[0.5px] border-border-default bg-bg-subtle p-1 pb-0',
                    contentClassName
                )}
                side="bottom"
                align="start"
                sideOffset={0}
            >
                <div
                    className="w-full border-b border-border-muted p-2"
                    onKeyDown={(e) => {
                        e.stopPropagation();
                    }}
                >
                    <InputGroup className="h-auto flex-1 justify-between rounded-[4px] border-[0.5px] border-border-muted bg-bg-surface px-2.5 py-1.5">
                        <InputGroupAddon className="p-0 pr-2">
                            <Search className="size-4 text-text-tertiary" />
                        </InputGroupAddon>
                        <InputGroupInput
                            type="text"
                            placeholder={searchPlaceholder}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="h-auto p-0 text-body-medium-regular text-text-tertiary placeholder:text-text-tertiary"
                        />
                    </InputGroup>
                </div>

                <div className="max-h-72 w-full overflow-y-auto p-2">
                    {filteredOptions.length > 0 ? (
                        filteredOptions.map((opt) => {
                            const selected = opt.value === value;
                            const rightOptionContent = renderOptionRight ? renderOptionRight(opt, selected) : null;
                            return (
                                <DropdownMenuItem
                                    key={opt.value}
                                    disabled={opt.disabled}
                                    onSelect={() => onValueChange(opt.value)}
                                    className={cn(
                                        'group flex w-full cursor-pointer items-center justify-between rounded-[4px] px-2 py-1 hover:bg-dropdown-bg-hover text-text-secondary hover:text-text-primary',
                                        selected &&
                                            'border-[0.5px] border-bg-elevated bg-bg-elevated text-text-primary hover:bg-bg-elevated text-text-secondary hover:text-text-primary'
                                    )}
                                >
                                    <div className="flex min-w-0 items-center gap-2">
                                        {showCheckbox ? (
                                            <span
                                                className={cn(
                                                    'flex size-5 shrink-0 items-center justify-center rounded-sm border',
                                                    selected ? 'border-transparent bg-gray-50 text-gray-1000' : 'border-border-strong bg-transparent'
                                                )}
                                            >
                                                {selected ? <Check className="size-3.5" /> : null}
                                            </span>
                                        ) : null}
                                        <div className="flex min-w-0 items-center gap-1 overflow-hidden text-body-medium-regular leading-[160%] tracking-normal">
                                            {renderOption ? renderOption(opt, selected) : <span className="truncate">{opt.label}</span>}
                                        </div>
                                    </div>
                                    {rightOptionContent ? (
                                        <div className="shrink-0">{rightOptionContent}</div>
                                    ) : selected ? (
                                        <Check className="size-4 shrink-0 text-text-primary" />
                                    ) : null}
                                </DropdownMenuItem>
                            );
                        })
                    ) : (
                        <div className="px-2 py-3 text-center">
                            <p className="text-text-tertiary text-body-small-regular">{emptyText}</p>
                        </div>
                    )}
                </div>

                {footer ? <div className="w-full border-t border-border-muted px-2 py-2">{footer}</div> : null}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
