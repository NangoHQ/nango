import type { SearchOperationsState } from '@nangohq/types';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '../../../components/ui/DropdownMenu';
import Button from '../../../components/ui/button/Button';
import { useState } from 'react';

export interface MultiSelectArgs {
    label: string;
    options: { name: string; value: SearchOperationsState }[];
    selected: SearchOperationsState[];
    defaultSelect: SearchOperationsState[];
    all?: boolean;
    onChange: (selected: SearchOperationsState[]) => void;
}

export const MultiSelect: React.FC<MultiSelectArgs> = ({ label, options, selected, defaultSelect, all, onChange }) => {
    const [open, setOpen] = useState(false);
    const select = (val: SearchOperationsState, checked: boolean) => {
        if (all && val === 'all') {
            onChange(['all']);
            return;
        }

        let tmp = checked ? [...selected, val] : selected.filter((sel) => sel !== val);
        if (all && tmp.length > 1) {
            tmp = tmp.filter((sel) => sel !== 'all');
        }
        onChange(tmp.length <= 0 ? defaultSelect : tmp);
    };

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <Button variant="zombieGray">{label}</Button>
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
