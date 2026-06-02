import { CheckIcon, CrossCircledIcon } from '@radix-ui/react-icons';
import { useMemo, useState } from 'react';

import { cn } from '../../../utils/utils';
import { typesOptions } from '../constants';
import { Button } from '@/components-v2/ui/Button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components-v2/ui/Popover';

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
                <Button variant="outline" size={'sm'} className={cn('h-9 text-text-light-gray', isDirty && 'text-white')}>
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
            <PopoverContent className="w-80 p-0 text-white bg-active-gray">
                <div role="listbox" className="h-[415px] overflow-y-auto overflow-x-hidden">
                    <div className="overflow-hidden p-2.5">
                        {typesOptions.map((parent) => {
                            const checked = selected.some((sel) => parent.value === sel);
                            return (
                                <div key={parent.value}>
                                    <div
                                        role="option"
                                        aria-selected={checked}
                                        tabIndex={0}
                                        onClick={() => select(parent.value, !checked)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                select(parent.value, !checked);
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
                                        {parent.name}
                                    </div>
                                    {parent.childs && (
                                        <div className="ml-4">
                                            {parent.childs.map((option) => {
                                                const childChecked = selected.some((sel) => option.value === sel);
                                                return (
                                                    <div
                                                        key={option.value}
                                                        role="option"
                                                        aria-selected={childChecked}
                                                        tabIndex={0}
                                                        onClick={() => select(option.value, !childChecked)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' || e.key === ' ') {
                                                                e.preventDefault();
                                                                select(option.value, !childChecked);
                                                            }
                                                        }}
                                                        className="px-2 text-gray-400 relative flex cursor-pointer rounded-sm select-none items-center py-1.5 pl-8 pr-2 text-sm outline-hidden transition-colors hover:bg-pure-black hover:text-white"
                                                    >
                                                        <span
                                                            className={cn(
                                                                'absolute left-2 flex h-3.5 w-3.5 items-center justify-center border border-neutral-700 rounded-xs',
                                                                childChecked && 'border-transparent'
                                                            )}
                                                        >
                                                            {childChecked && <CheckIcon className="h-5 w-5" />}
                                                        </span>
                                                        {option.name}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
};
