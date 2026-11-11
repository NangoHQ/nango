import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cva } from 'class-variance-authority';
import * as React from 'react';

import { useFieldControl } from '@nangohq/design-system';

import { cn } from '@/utils/utils';

import type { VariantProps } from 'class-variance-authority';

// Dharma Switch (Figma 2595:352). A switch only says on or off: there are no status colours.
// The 1px track padding plus the 1px border keeps the thumb 2px from the outer edge on every side.
export const switchVariants = cva(
    [
        'peer group/switch inline-flex shrink-0 cursor-pointer items-center rounded-ds-full border-ds-1 p-px outline-none',
        'transition-[background-color,border-color,color,box-shadow] duration-100 ease-in-out',
        // Off: the border keeps the track visible in dark mode
        'border-border-stronger bg-control-switch-track-off',
        'data-[state=unchecked]:not-disabled:hover:border-border-input-hover',
        // On
        'data-[state=checked]:border-interactive-primary data-[state=checked]:bg-interactive-primary',
        'data-[state=checked]:not-disabled:hover:border-interactive-primary-hover data-[state=checked]:not-disabled:hover:bg-interactive-primary-hover',
        // Focus: halo + ring, keyboard only
        'focus-visible:shadow-focus-outline-default',
        // Disabled
        'disabled:cursor-not-allowed disabled:border-border-disabled disabled:bg-state-disabled',
        'disabled:data-[state=checked]:border-border-disabled disabled:data-[state=checked]:bg-state-disabled'
    ],
    {
        variants: {
            size: {
                // Track 32×18, thumb 14, travel 14
                md: 'h-4.5 w-8',
                // Track 28×16, thumb 12, travel 12
                sm: 'h-4 w-7'
            }
        },
        defaultVariants: { size: 'md' }
    }
);

const switchThumbVariants = cva(
    [
        'pointer-events-none block rounded-ds-full shadow-control-switch-thumb-shadow',
        'transition-transform duration-150 ease-in-out data-[state=unchecked]:translate-x-0',
        'bg-control-switch-thumb-off data-[state=checked]:bg-icon-on-accent',
        'group-disabled/switch:shadow-none group-disabled/switch:bg-border-disabled group-disabled/switch:data-[state=checked]:bg-icon-disabled'
    ],
    {
        variants: {
            size: {
                md: 'size-3.5 data-[state=checked]:translate-x-3.5',
                sm: 'size-3 data-[state=checked]:translate-x-3'
            }
        },
        defaultVariants: { size: 'md' }
    }
);

export type SwitchProps = React.ComponentProps<typeof SwitchPrimitive.Root> & VariantProps<typeof switchVariants>;

function Switch({ className, size, ...props }: SwitchProps) {
    const fieldProps = useFieldControl(props);
    const resolvedSize = size ?? 'md';
    return (
        <SwitchPrimitive.Root
            data-slot="switch"
            data-size={resolvedSize}
            className={cn(switchVariants({ size: resolvedSize }), className)}
            {...props}
            {...fieldProps}
        >
            <SwitchPrimitive.Thumb data-slot="switch-thumb" className={switchThumbVariants({ size: resolvedSize })} />
        </SwitchPrimitive.Root>
    );
}

export { Switch };
