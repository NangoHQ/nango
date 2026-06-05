import { CheckIcon, CrossCircledIcon, MagnifyingGlassIcon } from '@radix-ui/react-icons';
import { useEffect, useMemo, useState } from 'react';
import { useDebounce } from 'react-use';

import { useSearchFilters } from '../../../hooks/useLogs';
import { useStore } from '../../../store';
import { cn } from '../../../utils/utils';
import { Alert, AlertDescription } from '@/components-v2/ui/Alert';
import { Button } from '@/components-v2/ui/Button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components-v2/ui/InputGroup';
import { Popover, PopoverContent, PopoverTrigger } from '@/components-v2/ui/Popover';
import { Spinner } from '@/components-v2/ui/Spinner';

export interface SearchableMultiSelectArgs<T> {
    label: string;
    category: T;
    selected: string[];
    max?: number;
    onChange: (selected: T[]) => void;
}

export const SearchableMultiSelect: React.FC<SearchableMultiSelectArgs<any>> = ({ label, category, selected, max, onChange }) => {
    const env = useStore((state) => state.env);

    const [open, setOpen] = useState(false);
    const [maxed, setMaxed] = useState(() => (max ? selected.length >= max : false));
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState<string | undefined>();
    const { data, loading, trigger } = useSearchFilters(open, env, { category, search: debouncedSearch });
    useDebounce(() => setDebouncedSearch(search), 250, [search]);

    const select = (val: string, checked: boolean) => {
        if (val === 'all') {
            onChange(['all']);
            setMaxed(false);
            return;
        }

        let tmp = checked ? [...selected, val] : selected.filter((sel) => sel !== val);
        if (tmp.length > 1) {
            tmp = tmp.filter((sel) => sel !== 'all');
        }
        if (max) {
            setMaxed(tmp.length >= max);
        }
        onChange(tmp.length <= 0 ? ['all'] : tmp);
    };

    const reset = (e: any) => {
        e.preventDefault();
        onChange(['all']);
        setMaxed(false);
    };

    const options = useMemo(() => {
        const tmp = [{ value: 'all', name: 'All' }];
        if (!data) {
            return tmp;
        }
        for (const item of data.data) {
            tmp.push({ value: item.key, name: item.key });
        }
        return tmp;
    }, [data]);

    const isDirty = useMemo(() => {
        return !(selected.length === 1 && selected[0] === 'all');
    }, [selected]);

    useEffect(() => {
        if (open && !data) {
            trigger();
        }
        if (!open) {
            setSearch('');
        }
    }, [open, data]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" size={'sm'} className={cn('h-9 text-text-light-gray', isDirty && 'text-white')}>
                    {label}
                    {isDirty && (
                        <button
                            className="bg-pure-black text-white flex gap-1 items-center px-1.5 rounded-xl"
                            onPointerDown={reset}
                            onKeyDown={(e) => {
                                if (['Enter', ' '].includes(e.key)) {
                                    reset(e);
                                }
                            }}
                        >
                            <CrossCircledIcon />
                            {selected.length}
                        </button>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 text-white bg-active-gray w-80" align="end">
                <div className="px-3 py-2">
                    <InputGroup className="bg-active-gray border-grayscale-600">
                        <InputGroupAddon>
                            <MagnifyingGlassIcon className="w-4 h-4" />
                        </InputGroupAddon>
                        <InputGroupInput placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
                        {loading && (
                            <InputGroupAddon align="inline-end">
                                <Spinner />
                            </InputGroupAddon>
                        )}
                    </InputGroup>
                </div>
                <div role="listbox" className="flex h-full w-full flex-col overflow-hidden">
                    <div className="max-h-[300px] overflow-y-auto overflow-x-hidden">
                        {options.length === 0 && <div className="py-6 text-center text-sm text-white">No framework found.</div>}
                        {maxed && (
                            <Alert variant="warning">
                                <AlertDescription>Can&apos;t select more filters</AlertDescription>
                            </Alert>
                        )}
                        <div className="overflow-hidden p-2.5">
                            {options.map((option) => {
                                const checked = selected.some((sel) => option.value === sel);
                                const isDisabled = !checked && maxed && option.value !== 'all';
                                return (
                                    <div
                                        key={option.value}
                                        role="option"
                                        aria-selected={checked}
                                        aria-disabled={isDisabled}
                                        tabIndex={isDisabled ? -1 : 0}
                                        onClick={() => !isDisabled && select(option.value, !checked)}
                                        onKeyDown={(e) => {
                                            if (isDisabled) return;
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                select(option.value, !checked);
                                            }
                                        }}
                                        className={cn(
                                            'group px-2 text-gray-400 relative flex cursor-pointer rounded-sm select-none items-center py-1.5 pl-8 pr-2 text-sm outline-hidden transition-colors hover:bg-pure-black hover:text-white focus-visible:bg-pure-black focus-visible:text-white',
                                            isDisabled && 'pointer-events-none opacity-50'
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'absolute left-2 flex h-3.5 w-3.5 items-center justify-center border border-neutral-700 rounded-xs',
                                                checked && 'border-transparent'
                                            )}
                                        >
                                            {checked && <CheckIcon className="h-5 w-5" />}
                                        </span>
                                        <div className="overflow-hidden">
                                            <div className="whitespace-pre w-fit">
                                                <div className={cn(option.name.length > 39 && 'duration-2000 group-hover:translate-x-[calc(-100%+258px)]')}>
                                                    {option.name}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
};
