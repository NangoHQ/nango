import { Button } from '../../../components/ui/button/Button';
import { useMemo, useState } from 'react';
import { CrossCircledIcon } from '@radix-ui/react-icons';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/Popover';
import { Command, CommandCheck, CommandEmpty, CommandGroup, CommandItem, CommandList } from '../../../components/ui/Command';
import { typesOptions } from '../constants';
import { Input } from '../../../components/ui/input/Input';
import { cn } from '../../../utils/utils';

export interface SearchableMultiSelectArgs<T> {
    selected: string[];
    onChange: (selected: T[]) => void;
}

export const TypesSelect: React.FC<SearchableMultiSelectArgs<any>> = ({ selected, onChange }) => {
    const [open, setOpen] = useState(false);

    const select = (val: string, checked: boolean) => {
        if (val === 'all') {
            onChange(['all']);
            return;
        }

        let tmp = checked ? [...selected, val] : selected.filter((sel) => sel !== val);
        const [type, action] = val.split(':');
        if (!action && checked) {
            // On check category, remove childs
            tmp = tmp.filter((sel) => !sel.startsWith(`${type}:`));
        } else if (action && checked) {
            // On check child, remove parent
            tmp = tmp.filter((sel) => sel !== type);
        }
        if (tmp.length > 1) {
            tmp = tmp.filter((sel) => sel !== 'all');
        }

        onChange(tmp.length <= 0 ? ['all'] : tmp);
    };

    const reset = (e: any) => {
        e.preventDefault();
        onChange(['all']);
    };

    const isDirty = useMemo(() => {
        return !(selected.length === 1 && selected[0] === 'all');
    }, [selected]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="zombieGray" size={'sm'} className={cn('text-text-light-gray', isDirty && 'text-white')}>
                    Type
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
            <PopoverContent className="w-72 p-0 text-white bg-active-gray">
                <Command>
                    <CommandList className="max-h-none h-[415px]">
                        <CommandEmpty>No framework found.</CommandEmpty>
                        <CommandGroup>
                            <Input className="opacity-0 h-0" />

                            {typesOptions.map((parent) => {
                                const checked = selected.some((sel) => parent.value === sel);
                                return (
                                    <div key={parent.value}>
                                        <CommandItem
                                            value={parent.value}
                                            onSelect={() => {
                                                select(parent.value, !checked);
                                            }}
                                        >
                                            <CommandCheck checked={checked} />
                                            {parent.name}
                                        </CommandItem>
                                        {parent.childs && (
                                            <div className="ml-4">
                                                {parent.childs.map((option) => {
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
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
};
