import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { cva } from 'class-variance-authority';
import { createContext, forwardRef, useContext } from 'react';

import { cn } from '../../lib/cn';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

import type { VariantProps } from 'class-variance-authority';

/** Pick one of 2–4 options. Use Tabs when each option swaps a panel, a Select for 5+, a Switch for on/off. */
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
        // Styled on aria-checked rather than Radix's data-state, which a wrapping TooltipTrigger overwrites.
        'aria-checked:bg-surface-panel aria-checked:text-text-strong aria-checked:shadow-container-panel',
        'disabled:cursor-not-allowed disabled:text-text-disabled disabled:hover:text-text-disabled',
        'aria-checked:disabled:bg-state-disabled aria-checked:disabled:text-text-disabled aria-checked:disabled:shadow-none',
        // Keyboard only. Declared after the selected shadow so the ring wins on a focused selected item.
        'focus-visible:outline-none focus-visible:shadow-focus-outline-default aria-checked:focus-visible:shadow-focus-outline-default',
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

const SegmentedControlSizeContext = createContext<SegmentedControlSize | null>(null);

export interface SegmentedControlProps
    extends Omit<React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>, 'value' | 'defaultValue' | 'onValueChange' | 'aria-label'> {
    size?: SegmentedControlSize;
    /** Controlled value. Always one of the items' values. */
    value?: string;
    /** Uncontrolled initial value. */
    defaultValue?: string;
    /** Called with the newly selected value. */
    onValueChange?: (value: string) => void;
    /** Names the group for assistive tech, e.g. "Theme". */
    'aria-label': string;
    /**
     * Which arrow keys move the selection. Unset, all four do. Set `horizontal` to leave Up/Down to a
     * parent, e.g. a menu that moves between its rows with them.
     */
    orientation?: 'horizontal' | 'vertical';
}

export const SegmentedControl = forwardRef<React.ElementRef<typeof RadioGroupPrimitive.Root>, SegmentedControlProps>(
    ({ className, size = 'md', children, ...props }, ref) => (
        <SegmentedControlSizeContext.Provider value={size}>
            <RadioGroupPrimitive.Root ref={ref} data-size={size} className={cn(segmentedControlVariants({ size }), className)} {...props}>
                {children}
            </RadioGroupPrimitive.Root>
        </SegmentedControlSizeContext.Provider>
    )
);
SegmentedControl.displayName = 'SegmentedControl';

type ItemBaseProps = Omit<React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>, 'children' | 'aria-label'> & {
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

export const SegmentedControlItem = forwardRef<React.ElementRef<typeof RadioGroupPrimitive.Item>, SegmentedControlItemProps>(
    ({ className, icon, children, ...props }, ref) => {
        const size = useContext(SegmentedControlSizeContext);
        if (!size) {
            throw new Error('SegmentedControlItem must be rendered inside a SegmentedControl');
        }
        const iconOnly = children === undefined || children === null || typeof children === 'boolean';

        const item = (
            <RadioGroupPrimitive.Item
                ref={ref}
                data-slot="segmented-control-item"
                className={cn(segmentedControlItemVariants({ size, iconOnly }), className)}
                {...props}
            >
                {icon}
                {children}
            </RadioGroupPrimitive.Item>
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
