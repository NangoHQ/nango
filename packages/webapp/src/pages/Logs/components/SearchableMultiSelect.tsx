import { Button } from '../../../components/ui/button/Button';
import { useEffect, useMemo, useState } from 'react';
import { CrossCircledIcon, MagnifyingGlassIcon } from '@radix-ui/react-icons';
import { useSearchFilters } from '../../../hooks/useLogs';
import { useStore } from '../../../store';
import { Input } from '../../../components/ui/input/Input';
import Spinner from '../../../components/ui/Spinner';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/Popover';
import { Command, CommandCheck, CommandEmpty, CommandGroup, CommandItem, CommandList } from '../../../components/ui/Command';
import { useDebounce } from 'react-use';
import { cn } from '../../../utils/utils';
import { Info } from '../../../components/Info';

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
                <Button variant="zombieGray" size={'sm'} className={cn('text-text-light-gray', isDirty && 'text-white')}>
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
                <Command>
                    <Input
                        before={<MagnifyingGlassIcon className="w-4 h-4" />}
                        after={loading && <Spinner size={1} />}
                        placeholder="Search..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        autoFocus
                        className="border-b border-b-border-gray-400 py-1"
                    />
                    <CommandList>
                        <CommandEmpty>No framework found.</CommandEmpty>
                        {maxed && <Info variant={'warning'}>Can&apos;t select more filters</Info>}
                        <CommandGroup>
                            {options.map((option) => {
                                const checked = selected.some((sel) => option.value === sel);
                                return (
                                    <CommandItem
                                        key={option.value}
                                        value={option.value}
                                        onSelect={() => {
                                            select(option.value, !checked);
                                        }}
                                        className="group"
                                        disabled={!checked && maxed && option.value !== 'all'}
                                    >
                                        <CommandCheck checked={checked} />
                                        <div className="overflow-hidden">
                                            <div className="whitespace-pre w-fit">
                                                <div className={cn(option.name.length > 39 && 'duration-[2000ms] group-hover:translate-x-[calc(-100%+258px)]')}>
                                                    {option.name}
                                                </div>
                                            </div>
                                        </div>
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
};
