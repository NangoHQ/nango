import debounce from 'lodash/debounce';
import { Search, Square, SquareCheck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from './ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from './ui/input-group';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { cn } from '@/utils/utils';

interface MultiSelectProps<T> {
    label: string;
    options: { name: string; value: T }[];
    selected: T[];
    defaultSelect?: T[];
    loading?: boolean;
    onChange: (selected: T[]) => void;
}

export const MultiSelect: React.FC<MultiSelectProps<unknown>> = ({ label, options, selected, defaultSelect = [], onChange, loading = false }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [filteredOptions, setFilteredOptions] = useState<typeof options>([]);
    const [displayOrder, setDisplayOrder] = useState<typeof options>([]);

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

            const filtered = initialOptions.filter((option) => option.name.toLowerCase().includes(value.toLowerCase()));
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
        // Only update displayOrder when popover transitions from closed to open, or when initialOptions changes
        const isOpening = open && !prevOpenRef.current;
        const optionsChanged = initialOptions !== prevInitialOptionsRef.current;

        if ((isOpening || optionsChanged) && initialOptions.length > 0) {
            const sorted = sortOptionsWithSelectedFirst(initialOptions, selected);
            setDisplayOrder(sorted);
        }
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

    const select = (val: unknown) => {
        const isSelected = selected.some((sel) => sel === val);
        let newSelected: unknown[];

        if (isSelected) {
            newSelected = selected.filter((sel) => sel !== val);
        } else {
            newSelected = [...selected, val];
        }

        onChange(newSelected.length <= 0 ? [...defaultSelect] : newSelected);
    };

    const isDirty = useMemo(() => {
        if (selected.length !== defaultSelect.length) return true;
        return selected.some((sel, index) => sel !== defaultSelect[index]);
    }, [selected, defaultSelect]);

    const optionsToRender = search.trim() ? filteredOptions : displayOrder.length > 0 ? displayOrder : initialOptions;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button loading={loading} disabled={options.length === 0} variant="tertiary" size="lg" className={cn(isDirty && 'bg-btn-tertiary-press')}>
                    {label}{' '}
                    {selected.length > 0 && (
                        <span className="text-text-primary text-body-small-semi bg-bg-subtle rounded-full h-5 min-w-5 flex items-center justify-center px-2">
                            {selected.length}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="bg-btn-tertiary-press w-72 rounded border border-border-muted">
                <div className="border-b border-border-muted">
                    <InputGroup className="bg-transparent border-none">
                        <InputGroupInput type="text" placeholder="Search" value={search} onChange={handleInputChange} />
                        <InputGroupAddon>
                            <Search />
                        </InputGroupAddon>
                    </InputGroup>
                </div>
                <div className="p-2 max-h-64 overflow-y-auto">
                    {optionsToRender.length === 0 ? (
                        <div className="p-2 text-center text-text-tertiary text-body-medium-medium">No options found</div>
                    ) : (
                        optionsToRender.map((option) => {
                            const checked = selected.some((sel) => sel === option.value);
                            return (
                                <div
                                    key={String(option.value)}
                                    className="group w-full p-2 inline-flex items-center gap-2 rounded hover:bg-nav-bg-hover cursor-pointer transition-colors"
                                    onClick={() => select(option.value)}
                                >
                                    {checked ? (
                                        <SquareCheck className="size-4 text-text-primary transition-colors" />
                                    ) : (
                                        <Square className="size-4 text-text-secondary group-hover:text-text-primary transition-colors" />
                                    )}
                                    <span
                                        className={`text-body-medium-medium transition-colors ${
                                            checked ? 'text-text-primary' : 'text-text-secondary group-hover:text-text-primary'
                                        }`}
                                    >
                                        {option.name}
                                    </span>
                                </div>
                            );
                        })
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
};
