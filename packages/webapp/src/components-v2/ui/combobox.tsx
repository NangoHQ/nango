import { Combobox as ComboboxPrimitive } from '@base-ui/react';
import { Check, CheckIcon, ChevronsUpDown, Search, XIcon } from 'lucide-react';
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

export function ComboboxSelect<T extends string = string>(props: ComboboxProps<T>) {
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

const Combobox = ComboboxPrimitive.Root;

function ComboboxValue({ ...props }: ComboboxPrimitive.Value.Props) {
    return <ComboboxPrimitive.Value data-slot="combobox-value" {...props} />;
}

function ComboboxContent({
    className,
    side = 'bottom',
    sideOffset = 6,
    align = 'start',
    alignOffset = 0,
    anchor,
    collisionAvoidance,
    ...props
}: ComboboxPrimitive.Popup.Props &
    Pick<ComboboxPrimitive.Positioner.Props, 'side' | 'align' | 'sideOffset' | 'alignOffset' | 'anchor' | 'collisionAvoidance'>) {
    return (
        <ComboboxPrimitive.Portal>
            <ComboboxPrimitive.Positioner
                side={side}
                sideOffset={sideOffset}
                align={align}
                alignOffset={alignOffset}
                anchor={anchor}
                collisionAvoidance={collisionAvoidance}
                className="isolate z-50 max-w-[100vw] overflow-hidden"
            >
                <ComboboxPrimitive.Popup
                    data-slot="combobox-content"
                    data-chips={!!anchor}
                    className={cn(
                        'group/combobox-content relative max-h-[var(--available-height)] w-[var(--anchor-width)] max-w-[min(var(--available-width),100vw)] origin-[var(--transform-origin)] overflow-hidden rounded-lg bg-bg-surface text-text-primary shadow-md ring-1 ring-border-muted duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
                        className
                    )}
                    {...props}
                />
            </ComboboxPrimitive.Positioner>
        </ComboboxPrimitive.Portal>
    );
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
    return (
        <ComboboxPrimitive.List
            data-slot="combobox-list"
            className={cn('no-scrollbar max-h-72 scroll-py-1 overflow-y-auto overscroll-contain p-1 data-empty:p-0', className)}
            {...props}
        />
    );
}

function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
    return (
        <ComboboxPrimitive.Item
            data-slot="combobox-item"
            className={cn(
                'relative flex w-full cursor-pointer items-center gap-2 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-highlighted:bg-dropdown-bg-hover data-highlighted:text-text-primary data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
                className
            )}
            {...props}
        >
            {children}
            <ComboboxPrimitive.ItemIndicator render={<span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />}>
                <CheckIcon className="pointer-events-none" />
            </ComboboxPrimitive.ItemIndicator>
        </ComboboxPrimitive.Item>
    );
}

function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
    return <ComboboxPrimitive.Group data-slot="combobox-group" className={cn(className)} {...props} />;
}

function ComboboxLabel({ className, ...props }: ComboboxPrimitive.GroupLabel.Props) {
    return <ComboboxPrimitive.GroupLabel data-slot="combobox-label" className={cn('px-2 py-1.5 text-xs text-text-secondary', className)} {...props} />;
}

function ComboboxCollection({ ...props }: ComboboxPrimitive.Collection.Props) {
    return <ComboboxPrimitive.Collection data-slot="combobox-collection" {...props} />;
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
    return (
        <ComboboxPrimitive.Empty
            data-slot="combobox-empty"
            className={cn('hidden w-full justify-center py-2 text-center text-sm text-text-secondary group-data-empty/combobox-content:flex', className)}
            {...props}
        />
    );
}

function ComboboxSeparator({ className, ...props }: ComboboxPrimitive.Separator.Props) {
    return <ComboboxPrimitive.Separator data-slot="combobox-separator" className={cn('-mx-1 my-1 h-px bg-border-muted', className)} {...props} />;
}

const ComboboxChips = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof ComboboxPrimitive.Chips> & ComboboxPrimitive.Chips.Props>(
    function ComboboxChips({ className, ...props }, ref) {
        return (
            <ComboboxPrimitive.Chips
                ref={ref}
                data-slot="combobox-chips"
                className={cn(
                    'flex flex-wrap items-center gap-1.5 rounded border border-border-muted bg-bg-surface px-2 text-sm outline-none focus:outline-none focus-visible:outline-none focus-within:border-border-muted has-data-[slot=combobox-chip]:px-1.5',
                    className
                )}
                {...props}
            />
        );
    }
);

function ComboboxChip({ className, children, showRemove = true, ...props }: ComboboxPrimitive.Chip.Props & { showRemove?: boolean }) {
    return (
        <ComboboxPrimitive.Chip
            data-slot="combobox-chip"
            className={cn(
                'inline-flex h-[21px] w-fit items-center justify-center gap-[2px] rounded bg-bg-elevated border border-border-default px-[6px] text-sm font-normal whitespace-nowrap text-text-secondary has-disabled:pointer-events-none has-disabled:cursor-not-allowed has-disabled:opacity-50 has-data-[slot=combobox-chip-remove]:pr-0.5',
                className
            )}
            {...props}
        >
            {children}
            {showRemove && (
                <ComboboxPrimitive.ChipRemove
                    render={<Button variant="ghost" size="icon" />}
                    className="size-4 opacity-50 hover:opacity-100 p-0 flex items-center justify-center"
                    data-slot="combobox-chip-remove"
                >
                    <XIcon className="pointer-events-none size-3" />
                </ComboboxPrimitive.ChipRemove>
            )}
        </ComboboxPrimitive.Chip>
    );
}

function ComboboxChipsInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
    return (
        <ComboboxPrimitive.Input
            data-slot="combobox-chip-input"
            className={cn(
                'min-w-16 flex-1 bg-transparent border-0 outline-none ring-0 focus:ring-0 focus:outline-none focus:shadow-none focus:border-transparent text-sm text-text-primary placeholder:text-text-tertiary',
                className
            )}
            {...props}
        />
    );
}

function useComboboxAnchor() {
    return React.useRef<HTMLDivElement | null>(null);
}

export {
    Combobox,
    ComboboxChip,
    ComboboxChips,
    ComboboxChipsInput,
    ComboboxCollection,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxGroup,
    ComboboxItem,
    ComboboxLabel,
    ComboboxList,
    ComboboxSeparator,
    ComboboxValue,
    useComboboxAnchor
};
