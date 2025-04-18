import { Button } from './ui/button/Button';
import { useMemo, useState } from 'react';
import { CrossCircledIcon } from '@radix-ui/react-icons';
import { Popover, PopoverContent, PopoverTrigger } from './ui/Popover';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList, CommandCheck } from './ui/Command';
import { cn } from '../utils/utils';

export interface MultiSelectArgs<T> {
    label: string;
    options: { name: string; value: T }[];
    selected: T[];
    defaultSelect: T[];
    all?: boolean;
    onChange: (selected: T[]) => void;
}

export const MultiSelect: React.FC<MultiSelectArgs<any>> = ({ label, options, selected, defaultSelect, all, onChange }) => {
    const [open, setOpen] = useState(false);

    const select = (val: string, checked: boolean) => {
        if (all && val === 'all') {
            onChange(['all']);
            return;
        }

        let tmp = checked ? [...selected, val] : selected.filter((sel) => sel !== val);
        if (all && tmp.length > 1) {
            tmp = tmp.filter((sel) => sel !== 'all');
        }
        onChange(tmp.length <= 0 ? [...defaultSelect] : tmp);
    };

    const reset = (e: any) => {
        e.preventDefault();
        if (all) {
            onChange(['all']);
        } else {
            onChange([...defaultSelect]);
        }
    };

    const isDirty = useMemo(() => {
        if (!all) {
            return selected.length !== options.length;
        }

        return !(selected.length === 1 && selected[0] === 'all');
    }, [selected, all, options]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="zombieGray" size={'sm'} className={cn('text-text-light-gray', isDirty && 'text-white')}>
                    {label}
                    {isDirty && (
                        <button
                            className="bg-pure-black text-text-light-gray flex gap-1 items-center px-1.5 rounded-xl"
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
            <PopoverContent className="w-56 p-0 text-white bg-active-gray" align="end">
                <Command>
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
