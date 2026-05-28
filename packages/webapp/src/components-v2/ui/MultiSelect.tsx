import debounce from 'lodash/debounce';
import { Check, Search } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from './ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from './ui/input-group';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { cn } from '@/utils/utils';

import type { ComboboxOption } from './ui/combobox';

interface MultiSelectProps<T extends string = string> {
    label: string;
    options: ComboboxOption<T>[];
    selected: T[];
    defaultSelect?: T[];
    loading?: boolean;
    searchPlaceholder?: string;
    onValueChange: (selected: T[]) => void;
    renderOption?: (option: ComboboxOption<T>, selected: boolean) => React.ReactNode;
    renderOptionRight?: (option: ComboboxOption<T>, selected: boolean) => React.ReactNode;
    emptyText?: string;
    footer?: React.ReactNode;
}

export function MultiSelect<T extends string = string>({
    label,
    options,
    selected,
    defaultSelect = [],
    onValueChange,
    loading = false,
    searchPlaceholder = 'Search',
    renderOption,
    renderOptionRight,
    emptyText = 'No results found.',
    footer
}: MultiSelectProps<T>) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [filteredOptions, setFilteredOptions] = useState<typeof options>([]);

    const initialOptions = useMemo(() => {
        return options ?? [];
    }, [options]);

    const sortOptionsWithSelectedFirst = useCallback((opts: typeof options, selectedValues: typeof selected) => {
        const selectedItems: typeof options = [];
        const unselectedItems: typeof options = [];

        opts.forEach((option) => {
            if (selectedValues.some((sel) => sel === option.value)) {
                selectedItems.push(option);
            } else {
                unselectedItems.push(option);
            }
        });

        return [...selectedItems, ...unselectedItems];
    }, []);

    const prevOpenRef = useRef(false);
    const prevInitialOptionsRef = useRef(initialOptions);

    useEffect(() => {
        if (initialOptions) {
            setFilteredOptions(initialOptions);
        }
    }, [initialOptions]);

    const filterOptions = useCallback(
        (value: string) => {
            if (!value.trim()) {
                setFilteredOptions(initialOptions);
                return;
            }

            const filtered = initialOptions.filter((option) => option.label.toLowerCase().includes(value.toLowerCase()));
            setFilteredOptions(filtered);
        },
        [initialOptions]
    );

    const debouncedFilterOptions = useMemo(() => debounce(filterOptions, 250), [filterOptions]);

    useEffect(() => {
        return () => {
            debouncedFilterOptions.cancel();
        };
    }, [debouncedFilterOptions]);

    useEffect(() => {
        if (!open) {
            setSearch('');
        }
    }, [open]);

    useEffect(() => {
        prevOpenRef.current = open;
        prevInitialOptionsRef.current = initialOptions;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, initialOptions, sortOptionsWithSelectedFirst]);

    const handleInputChange = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            setSearch(event.target.value);
            debouncedFilterOptions(event.target.value);
        },
        [debouncedFilterOptions]
    );

    const select = (val: T) => {
        const isSelected = selected.some((sel) => sel === val);
        let newSelected: T[];

        if (isSelected) {
            newSelected = selected.filter((sel) => sel !== val);
        } else {
            newSelected = [...selected, val];
        }

        onValueChange(newSelected.length <= 0 ? [...defaultSelect] : newSelected);
    };

    const isDirty = useMemo(() => {
        if (selected.length !== defaultSelect.length) return true;
        return selected.some((sel, index) => sel !== defaultSelect[index]);
    }, [selected, defaultSelect]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    loading={loading}
                    disabled={options.length === 0}
                    variant="ghost"
                    size="lg"
                    className={cn('border border-border-muted', isDirty && 'bg-btn-tertiary-press', open ? 'bg-bg-subtle' : 'hover:bg-dropdown-bg-hover')}
                >
                    {label}{' '}
                    {selected.length > 0 && (
                        <span className="text-text-primary text-body-small-semi bg-bg-subtle rounded-full h-5 min-w-5 flex items-center justify-center px-2">
                            {selected.length}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                className="flex w-[var(--radix-popover-trigger-width)] min-w-[312px] flex-col items-start overflow-hidden rounded-[4px] border-[0.5px] border-border-default bg-bg-subtle p-1 pb-0"
            >
                <div className="border-b border-border-muted w-full">
                    <InputGroup className="h-auto flex-1 justify-between rounded-[4px] border-[0.5px] border-border-muted bg-bg-surface px-2.5 py-1.5">
                        <InputGroupAddon className="p-0 pr-2">
                            <Search className="size-4 text-text-tertiary" />
                        </InputGroupAddon>
                        <InputGroupInput
                            type="text"
                            placeholder={searchPlaceholder}
                            value={search}
                            onChange={handleInputChange}
                            className="h-auto p-0 text-body-medium-regular text-text-tertiary placeholder:text-text-tertiary"
                        />
                    </InputGroup>
                </div>
                <div className="max-h-72 w-full overflow-y-auto">
                    {filteredOptions.length > 0 ? (
                        filteredOptions.map((opt) => {
                            const isSelected = selected.indexOf(opt.value) !== -1;
                            const rightOptionContent = renderOptionRight ? renderOptionRight(opt, isSelected) : null;
                            return (
                                <div
                                    key={opt.value}
                                    onClick={() => select(opt.value)}
                                    className={cn(
                                        'group flex w-full cursor-pointer items-center justify-between rounded-[4px] px-2 py-1 hover:bg-dropdown-bg-hover text-text-secondary hover:text-text-primary',
                                        isSelected &&
                                            'border-[0.5px] border-bg-elevated bg-bg-elevated text-text-primary hover:bg-bg-elevated hover:text-text-primary'
                                    )}
                                >
                                    <div className="flex min-w-0 items-center gap-2">
                                        <span
                                            className={cn(
                                                'flex size-5 shrink-0 items-center justify-center rounded-sm border',
                                                isSelected ? 'border-transparent bg-gray-50 text-gray-1000' : 'border-border-strong bg-transparent'
                                            )}
                                        >
                                            {isSelected ? <Check className="size-3.5" /> : null}
                                        </span>
                                        <div className="flex min-w-0 items-center gap-1 overflow-hidden text-body-medium-regular leading-[160%] tracking-normal">
                                            {renderOption ? renderOption(opt, isSelected) : <span className="truncate">{opt.label}</span>}
                                        </div>
                                    </div>
                                    {rightOptionContent ? <div className="shrink-0">{rightOptionContent}</div> : null}
                                </div>
                            );
                        })
                    ) : (
                        <div className="px-2 py-3 text-center">
                            <p className="text-text-tertiary text-body-small-regular">{emptyText}</p>
                        </div>
                    )}
                </div>

                {footer ? <div className="w-full border-t border-border-muted px-1 py-2">{footer}</div> : null}
            </PopoverContent>
        </Popover>
    );
}
