import { Combobox as ComboboxPrimitive } from '@base-ui/react';
import { CheckIcon, XIcon } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components-v2/ui/button';
import { cn } from '@/utils/utils';

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
    ...props
}: ComboboxPrimitive.Popup.Props & Pick<ComboboxPrimitive.Positioner.Props, 'side' | 'align' | 'sideOffset' | 'alignOffset' | 'anchor'>) {
    return (
        <ComboboxPrimitive.Portal>
            <ComboboxPrimitive.Positioner
                side={side}
                sideOffset={sideOffset}
                align={align}
                alignOffset={alignOffset}
                anchor={anchor}
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
                    'flex min-h-9 flex-wrap items-center gap-1.5 rounded border border-border-muted bg-bg-surface px-2 py-1.5 text-sm outline-none focus:outline-none focus-visible:outline-none focus-within:border-border-muted has-data-[slot=combobox-chip]:px-1.5',
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
