import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '../../../components/ui/DropdownMenu';
import Button from '../../../components/ui/button/Button';
import { useMemo, useState } from 'react';
import { CrossCircledIcon } from '@radix-ui/react-icons';

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
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger>
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
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
                {options.map((option) => {
                    const checked = selected.some((sel) => option.value === sel);
                    return (
                        <DropdownMenuCheckboxItem
                            key={option.value}
                            checked={checked}
                            onClick={(e) => {
                                e.preventDefault();
                                select(option.value, !checked);
                            }}
                        >
                            {option.name}
                        </DropdownMenuCheckboxItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
