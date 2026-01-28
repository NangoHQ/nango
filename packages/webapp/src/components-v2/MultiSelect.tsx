import debounce from 'lodash/debounce';
import { Search, Square, SquareCheck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

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

    const initialOptions = useMemo(() => {
        return options ?? [];
    }, [options]);

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

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger>
                <Button loading={loading} disabled={options.length === 0} variant="tertiary" size="lg" className={cn(isDirty && 'bg-btn-tertiary-press')}>
                    {label}
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
                    {filteredOptions.length === 0 ? (
                        <div className="p-2 text-center text-text-tertiary text-body-medium-medium">No options found</div>
                    ) : (
                        filteredOptions.map((option) => {
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
