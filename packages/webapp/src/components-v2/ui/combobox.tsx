import { Check, ChevronsUpDown, Search } from 'lucide-react';
import * as React from 'react';

import { Button } from './button';
import { InputGroup, InputGroupAddon, InputGroupInput } from './input-group';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { cn } from '@/utils/utils';

export interface ComboboxOption<TValue extends string = string> {
    value: TValue;
    label: string;
    filterValue?: string;
    disabled?: boolean;
    icon?: React.ReactNode;
    tag?: React.ReactNode;
}

interface ComboboxBaseProps<T extends string = string> {
    options: ComboboxOption<T>[];
    disabled?: boolean;
    searchPlaceholder?: string;
    emptyText?: string;
    footer?: React.ReactNode;
    className?: string;
    contentClassName?: string;
}

interface SingleProps<T extends string = string> extends ComboboxBaseProps<T> {
    allowMultiple?: false;
    value: T | '';
    onValueChange: (value: T) => void;
    placeholder: string;
    showCheckbox?: boolean;
    searchValue?: string;
    onSearchValueChange?: (value: string) => void;
    selected?: never;
    label?: never;
    defaultSelect?: never;
    loading?: never;
    onSelectedChange?: never;
}

interface MultiProps<T extends string = string> extends ComboboxBaseProps<T> {
    allowMultiple: true;
    selected: T[];
    onSelectedChange: (selected: T[]) => void;
    label: string;
    defaultSelect?: T[];
    loading?: boolean;
    value?: never;
    onValueChange?: never;
    placeholder?: never;
    showCheckbox?: never;
    searchValue?: never;
    onSearchValueChange?: never;
}

export type ComboboxProps<T extends string = string> = SingleProps<T> | MultiProps<T>;

function ItemLabel<T extends string>({ opt }: { opt: ComboboxOption<T> }) {
    return (
        <>
            {opt.icon}
            <span className="truncate">{opt.label}</span>
        </>
    );
}

export function Combobox<T extends string = string>(props: ComboboxProps<T>) {
    const { options, disabled, searchPlaceholder = 'Search', emptyText = 'No results found.', footer, className, contentClassName } = props;

    const [open, setOpen] = React.useState(false);
    const [internalSearch, setInternalSearch] = React.useState('');

    const controlledSearch = !props.allowMultiple ? props.searchValue : undefined;
    const search = controlledSearch !== undefined ? controlledSearch : internalSearch;

    const setSearch = React.useCallback(
        (next: string) => {
            if (!props.allowMultiple && props.onSearchValueChange) {
                props.onSearchValueChange(next);
            } else {
                setInternalSearch(next);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [props.allowMultiple, !props.allowMultiple ? props.onSearchValueChange : null]
    );

    React.useEffect(() => {
        if (!open) setSearch('');
    }, [open, setSearch]);

    const filteredOptions = React.useMemo(() => {
        const q = search.trim().toLowerCase();
        const filtered = q ? options.filter((opt) => (opt.filterValue ?? opt.label).toLowerCase().includes(q)) : options;

        if (props.allowMultiple && !q) {
            const selectedSet = new Set(props.selected);
            const sel: typeof options = [];
            const unsel: typeof options = [];
            filtered.forEach((o) => (selectedSet.has(o.value) ? sel : unsel).push(o));
            return [...sel, ...unsel];
        }

        return filtered;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [options, search, props.allowMultiple, props.allowMultiple ? props.selected : null]);

    const handleSelect = React.useCallback(
        (val: T) => {
            if (props.allowMultiple) {
                const isSelected = props.selected.includes(val);
                const next = isSelected ? props.selected.filter((s) => s !== val) : [...props.selected, val];
                const defaultSelect = props.defaultSelect ?? [];
                props.onSelectedChange(next.length === 0 ? [...defaultSelect] : next);
            } else {
                props.onValueChange(val);
                setOpen(false);
            }
        },

        [props]
    );

    const selectedOption = React.useMemo(() => {
        if (props.allowMultiple) return undefined;
        return options.find((opt) => opt.value === props.value);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [options, props.allowMultiple, !props.allowMultiple ? props.value : null]);

    const isDirty = React.useMemo(() => {
        if (!props.allowMultiple) return false;
        const def = props.defaultSelect ?? [];
        return props.selected.length !== def.length || props.selected.some((s, i) => s !== def[i]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.allowMultiple, props.allowMultiple ? props.selected : null, props.allowMultiple ? props.defaultSelect : null]);

    const showCheckbox = props.allowMultiple ? true : (props.showCheckbox ?? true);

    const trigger = props.allowMultiple ? (
        <Button
            loading={props.loading}
            disabled={disabled || options.length === 0}
            variant="ghost"
            size="lg"
            className={cn('border border-border-muted', isDirty && 'bg-btn-tertiary-press', open ? 'bg-bg-subtle' : 'hover:bg-dropdown-bg-hover', className)}
        >
            {props.label}{' '}
            {props.selected.length > 0 && (
                <span className="text-text-primary text-body-small-semi bg-bg-subtle rounded-full h-5 min-w-5 flex items-center justify-center px-2">
                    {props.selected.length}
                </span>
            )}
        </Button>
    ) : (
        <button
            type="button"
            disabled={disabled}
            className={cn(
                'text-[14px] h-8 cursor-pointer flex w-full min-w-0 items-center justify-between gap-1.5 self-stretch rounded-[4px] bg-bg-surface px-2 py-0 text-body-medium-regular leading-[160%] tracking-normal outline-none transition-[color,box-shadow] focus-default hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50',
                selectedOption ? 'text-text-primary' : 'text-text-secondary',
                open ? 'bg-bg-subtle' : 'hover:bg-dropdown-bg-hover',
                className
            )}
        >
            {selectedOption ? (
                <span className="flex items-center gap-2 min-w-0">
                    <ItemLabel opt={selectedOption} />
                    {selectedOption.tag}
                </span>
            ) : (
                <span className="truncate">{props.placeholder}</span>
            )}
            <ChevronsUpDown className="size-3 shrink-0 text-text-secondary" />
        </button>
    );

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
            <PopoverContent
                align={props.allowMultiple ? 'end' : 'start'}
                sideOffset={0}
                className={cn(
                    'z-[70] flex w-[var(--radix-popover-trigger-width)] flex-col items-start overflow-hidden rounded-[4px] border-[0.5px] border-border-default bg-bg-subtle p-1 pb-0',
                    props.allowMultiple && 'min-w-[312px]',
                    contentClassName
                )}
            >
                <div className="w-full border-b border-border-muted" onKeyDown={(e) => e.stopPropagation()}>
                    <InputGroup className="h-auto flex-1 justify-between rounded-[4px] border-[0.5px] border-border-muted bg-bg-surface px-2.5 py-1.5">
                        <InputGroupAddon className="p-0 pr-2">
                            <Search className="size-4 text-text-tertiary" />
                        </InputGroupAddon>
                        <InputGroupInput
                            type="text"
                            placeholder={searchPlaceholder}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="h-auto p-0 text-body-medium-regular text-text-tertiary placeholder:text-text-tertiary"
                        />
                    </InputGroup>
                </div>

                <div className="max-h-72 w-full overflow-y-auto" role="listbox">
                    {filteredOptions.length > 0 ? (
                        filteredOptions.map((opt) => {
                            const isSelected = props.allowMultiple ? props.selected.includes(opt.value) : opt.value === props.value;

                            return (
                                <div
                                    key={opt.value}
                                    role="option"
                                    tabIndex={opt.disabled ? -1 : 0}
                                    aria-selected={isSelected}
                                    onClick={() => !opt.disabled && handleSelect(opt.value)}
                                    onKeyDown={(e) => {
                                        if (opt.disabled) return;
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            handleSelect(opt.value);
                                        }
                                    }}
                                    className={cn(
                                        'group flex w-full cursor-pointer items-center justify-between rounded-[4px] px-2 py-1 hover:bg-dropdown-bg-hover text-text-secondary hover:text-text-primary',
                                        opt.disabled && 'cursor-not-allowed opacity-50 pointer-events-none',
                                        isSelected &&
                                            'border-[0.5px] border-bg-elevated bg-bg-elevated text-text-primary hover:bg-bg-elevated hover:text-text-primary'
                                    )}
                                >
                                    <div className="flex min-w-0 items-center gap-2">
                                        {showCheckbox && (
                                            <span
                                                className={cn(
                                                    'flex size-5 shrink-0 items-center justify-center rounded-sm border',
                                                    isSelected ? 'border-transparent bg-gray-50 text-gray-1000' : 'border-border-strong bg-transparent'
                                                )}
                                            >
                                                {isSelected ? <Check className="size-3.5" /> : null}
                                            </span>
                                        )}
                                        <div className="flex min-w-0 items-center gap-1 overflow-hidden text-body-medium-regular leading-[160%] tracking-normal">
                                            <ItemLabel opt={opt} />
                                        </div>
                                    </div>

                                    {opt.tag ? (
                                        <div className="shrink-0">{opt.tag}</div>
                                    ) : isSelected && !showCheckbox ? (
                                        <Check className="size-4 shrink-0 text-text-primary" />
                                    ) : null}
                                </div>
                            );
                        })
                    ) : (
                        <div className="px-2 py-3 text-center">
                            <p className="text-text-tertiary text-body-small-regular">{emptyText}</p>
                        </div>
                    )}
                </div>

                {footer && <div className="w-full border-t border-border-muted px-1 py-2">{footer}</div>}
            </PopoverContent>
        </Popover>
    );
}
