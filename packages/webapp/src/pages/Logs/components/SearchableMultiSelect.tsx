import Button from '../../../components/ui/button/Button';
import { useEffect, useMemo, useState } from 'react';
import { CrossCircledIcon, MagnifyingGlassIcon } from '@radix-ui/react-icons';
import { useSearchFilters } from '../../../hooks/useLogs';
import { useStore } from '../../../store';
import { Input } from '../../../components/ui/input/Input';
import Spinner from '../../../components/ui/Spinner';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/Popover';
import { Command, CommandCheck, CommandEmpty, CommandGroup, CommandItem, CommandList } from '../../../components/ui/Command';
import { useDebounce } from 'react-use';

export interface SearchableMultiSelectArgs<T> {
    label: string;
    category: T;
    selected: string[];
    onChange: (selected: T[]) => void;
}

export const SearchableMultiSelect: React.FC<SearchableMultiSelectArgs<any>> = ({ label, category, selected, onChange }) => {
    const env = useStore((state) => state.env);

    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState<string | undefined>();
    const { data, loading, trigger } = useSearchFilters(open, env, { category, search: debouncedSearch });
    useDebounce(() => setDebouncedSearch(search), 250, [search]);

    const select = (val: string, checked: boolean) => {
        if (val === 'all') {
            onChange(['all']);
            return;
        }

        let tmp = checked ? [...selected, val] : selected.filter((sel) => sel !== val);
        if (tmp.length > 1) {
            tmp = tmp.filter((sel) => sel !== 'all');
        }
        onChange(tmp.length <= 0 ? ['all'] : tmp);
    };

    const reset = (e: any) => {
        e.preventDefault();
        onChange(['all']);
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
                <Button variant="zombieGray" size={'xs'}>
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
            <PopoverContent className="w-56 p-0 text-white bg-active-gray">
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
                                    >
                                        <CommandCheck checked={checked} />
                                        {option.name}
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
