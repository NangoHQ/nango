import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import { cva } from 'class-variance-authority';
import { createContext, forwardRef, useCallback, useContext, useRef, useState } from 'react';

import { cn } from '../../lib/cn';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

import type { VariantProps } from 'class-variance-authority';

/**
 * Pick one of 2–4 options in place (Figma "Segmented Control", 2621:280). Built on Radix ToggleGroup
 * `type="single"`, but it always keeps exactly one value: a click on the selected item doesn't clear it,
 * and arrow keys move the selection like a radio group. Use Tabs when each option swaps a panel below,
 * a Select for 5+ options, a Switch for on/off.
 */
export const segmentedControlVariants = cva(
    ['inline-flex shrink-0 items-center gap-0.5 px-0.5', 'rounded-ds-sm border-ds-1 border-border-default bg-surface-canvas'],
    {
        variants: {
            size: {
                md: 'h-8',
                sm: 'h-7'
            }
        },
        defaultVariants: { size: 'md' }
    }
);

export const segmentedControlItemVariants = cva(
    [
        'inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-ds-xs',
        'font-sans font-ds-medium leading-ds-normal tracking-ds-normal',
        'text-text-secondary hover:text-text-default',
        'data-selected:bg-surface-panel data-selected:text-text-strong data-selected:shadow-container-panel',
        'disabled:cursor-not-allowed disabled:text-text-disabled disabled:hover:text-text-disabled',
        'data-selected:disabled:bg-state-disabled data-selected:disabled:text-text-disabled data-selected:disabled:shadow-none',
        // Keyboard only. Declared after the selected shadow so the ring wins on a focused selected item.
        'focus-visible:outline-none focus-visible:shadow-focus-outline-default data-selected:focus-visible:shadow-focus-outline-default',
        'transition-[background-color,color,box-shadow] duration-100 ease-in-out',
        '[&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0'
    ],
    {
        variants: {
            size: {
                md: 'h-6.5 px-2.5 text-ds-sm',
                sm: 'h-5.5 px-2 text-ds-xs'
            },
            iconOnly: {
                true: 'px-0',
                false: ''
            }
        },
        compoundVariants: [
            { size: 'md', iconOnly: true, className: 'w-6.5' },
            { size: 'sm', iconOnly: true, className: 'w-5.5' }
        ],
        defaultVariants: { size: 'md', iconOnly: false }
    }
);

type SegmentedControlSize = NonNullable<VariantProps<typeof segmentedControlVariants>['size']>;

interface SegmentedControlContextValue {
    size: SegmentedControlSize;
    value: string;
    /** Set by an arrow/Home/End keydown so the item that receives roving focus selects itself. */
    selectOnFocus: React.MutableRefObject<boolean>;
    select: (value: string) => void;
}

const SegmentedControlContext = createContext<SegmentedControlContextValue | null>(null);

const NAVIGATION_KEYS = {
    horizontal: ['ArrowLeft', 'ArrowRight', 'Home', 'End'],
    vertical: ['ArrowUp', 'ArrowDown', 'Home', 'End'],
    both: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']
};

export interface SegmentedControlProps
    extends Omit<
        React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>,
        'type' | 'value' | 'defaultValue' | 'onValueChange' | 'rovingFocus' | 'aria-label'
    > {
    size?: SegmentedControlSize;
    /** Controlled value. Always one of the items' values. */
    value?: string;
    /** Uncontrolled initial value. */
    defaultValue?: string;
    /** Called with the newly selected value. Never called with an empty string. */
    onValueChange?: (value: string) => void;
    /** Names the group for assistive tech, e.g. "Theme". */
    'aria-label': string;
    /**
     * Which arrow keys move the selection. Unset, all four do. Set `horizontal` to leave Up/Down to a
     * parent, e.g. a menu that moves between its rows with them.
     */
    orientation?: 'horizontal' | 'vertical';
}

export const SegmentedControl = forwardRef<React.ElementRef<typeof ToggleGroupPrimitive.Root>, SegmentedControlProps>(
    ({ className, size = 'md', value: valueProp, defaultValue, onValueChange, onKeyDown, orientation, children, ...props }, ref) => {
        const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? '');
        const value = valueProp ?? uncontrolledValue;
        const selectOnFocus = useRef(false);

        const select = useCallback(
            (next: string) => {
                // Radix reports '' when the selected item is pressed again: keep the current value.
                if (!next || next === value) {
                    return;
                }
                if (valueProp === undefined) {
                    setUncontrolledValue(next);
                }
                onValueChange?.(next);
            },
            [value, valueProp, onValueChange]
        );

        return (
            <SegmentedControlContext.Provider value={{ size, value, selectOnFocus, select }}>
                <ToggleGroupPrimitive.Root
                    ref={ref}
                    type="single"
                    value={value}
                    onValueChange={select}
                    orientation={orientation}
                    onKeyDown={(event) => {
                        onKeyDown?.(event);
                        selectOnFocus.current = NAVIGATION_KEYS[orientation ?? 'both'].includes(event.key);
                    }}
                    data-size={size}
                    className={cn(segmentedControlVariants({ size }), className)}
                    {...props}
                >
                    {children}
                </ToggleGroupPrimitive.Root>
            </SegmentedControlContext.Provider>
        );
    }
);
SegmentedControl.displayName = 'SegmentedControl';

type ItemBaseProps = Omit<React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>, 'children' | 'aria-label'> & {
    /** Leading 14px icon, e.g. `<Monitor />`. */
    icon?: React.ReactNode;
};

export type SegmentedControlItemProps = ItemBaseProps &
    (
        | {
              /** Text label. One or two words. Empty children (null, booleans) would render icon-only, so they need the other branch. */
              children: Exclude<React.ReactNode, null | undefined | boolean>;
              'aria-label'?: string;
          }
        | {
              children?: null | false;
              icon: React.ReactNode;
              /** Icon-only items need a name: it is also shown as the tooltip. */
              'aria-label': string;
          }
    );

export const SegmentedControlItem = forwardRef<React.ElementRef<typeof ToggleGroupPrimitive.Item>, SegmentedControlItemProps>(
    ({ className, icon, children, onFocus, ...props }, ref) => {
        const context = useContext(SegmentedControlContext);
        if (!context) {
            throw new Error('SegmentedControlItem must be rendered inside a SegmentedControl');
        }
        const { size, value, selectOnFocus, select } = context;
        const iconOnly = children === undefined || children === null || typeof children === 'boolean';

        const item = (
            <ToggleGroupPrimitive.Item
                ref={ref}
                data-slot="segmented-control-item"
                // Styled on this rather than Radix's data-state, which a wrapping TooltipTrigger overwrites.
                data-selected={value === props.value ? '' : undefined}
                className={cn(segmentedControlItemVariants({ size, iconOnly }), className)}
                onFocus={(event) => {
                    onFocus?.(event);
                    // Arrow keys move the selection, not just focus (radio-group behaviour).
                    if (selectOnFocus.current && !props.disabled) {
                        selectOnFocus.current = false;
                        select(props.value);
                    }
                }}
                {...props}
            >
                {icon}
                {children}
            </ToggleGroupPrimitive.Item>
        );

        if (!iconOnly) {
            return item;
        }

        return (
            <Tooltip>
                <TooltipTrigger asChild>{item}</TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>
                    {props['aria-label']}
                </TooltipContent>
            </Tooltip>
        );
    }
);
SegmentedControlItem.displayName = 'SegmentedControlItem';
