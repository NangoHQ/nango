import { CheckIcon, CrossCircledIcon } from '@radix-ui/react-icons';
import { useMemo, useState } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import { cn } from '../../utils/utils';
import { Button } from '@/components-v2/ui/Button';

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
                <Button variant="outline" size={'sm'} className={cn('h-9 text-text-light-gray', isDirty && 'text-white')}>
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
                <div role="listbox" className="flex h-full w-full flex-col overflow-hidden rounded-md">
                    <div className="max-h-[300px] overflow-y-auto overflow-x-hidden">
                        {options.length === 0 && <div className="py-6 text-center text-sm text-white">No options found.</div>}
                        <div className="overflow-hidden p-2.5">
                            {options.map((option) => {
                                const checked = selected.some((sel) => option.value === sel);
                                return (
                                    <div
                                        key={option.value}
                                        role="option"
                                        aria-selected={checked}
                                        tabIndex={0}
                                        onClick={() => select(option.value, !checked)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                select(option.value, !checked);
                                            }
                                        }}
                                        className="px-2 text-gray-400 relative flex cursor-pointer rounded-sm select-none items-center py-1.5 pl-8 pr-2 text-sm outline-hidden transition-colors hover:bg-pure-black hover:text-white"
                                    >
                                        <span
                                            className={cn(
                                                'absolute left-2 flex h-3.5 w-3.5 items-center justify-center border border-neutral-700 rounded-xs',
                                                checked && 'border-transparent'
                                            )}
                                        >
                                            {checked && <CheckIcon className="h-5 w-5" />}
                                        </span>
                                        {option.name}
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
