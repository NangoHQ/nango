import { cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/cn';

import type { VariantProps } from 'class-variance-authority';

export const inputVariants = cva(
    [
        // Shape + spacing (Figma: hairline border, radius/sm)
        'flex w-full min-w-0 rounded-ds-sm border-ds-hairline outline-none transition-[background-color,border-color,color,box-shadow] duration-100 ease-in-out',
        // Typography (Figma text/regular/md)
        'text-ds-md font-ds-regular leading-ds-normal',
        // Default colors
        'bg-surface-input border-border-interactive text-text-default placeholder:text-text-secondary',
        // Hover border. On focus the 0.5px hairline border adopts the ring color and a 1px inset shadow draws the ring just inside
        // the edge, so the ring covers the border and sits flush inside without expanding the field's footprint.
        'hover:border-border-interactive-hover',
        'focus:border-[var(--focus-ring-default)] focus:shadow-[inset_0_0_0_1px_var(--focus-ring-default)]',
        // Invalid
        'aria-invalid:border-status-danger-border aria-invalid:focus:border-[var(--focus-ring-danger)] aria-invalid:focus:shadow-[inset_0_0_0_1px_var(--focus-ring-danger)]',
        // Disabled — dedicated tokens, no opacity (Figma state/selectedMuted bg, border/disabled, text/disabled)
        'disabled:cursor-not-allowed disabled:border-border-disabled disabled:bg-state-selected-muted disabled:text-text-disabled disabled:placeholder:text-text-disabled',
        // File-input affordance
        'file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-text-strong file:text-ds-md file:font-ds-medium'
    ],
    {
        variants: {
            size: {
                // Default control height (Figma: space/2 × space/1.5)
                default: 'h-9 px-2 py-1.5',
                // Hug-content — for in-popover search fields where the wrapper owns the padding
                auto: 'h-auto p-0'
            }
        },
        defaultVariants: {
            size: 'default'
        }
    }
);

export interface InputProps extends Omit<React.ComponentProps<'input'>, 'size'>, VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, size, autoComplete, ...props }, ref) => {
    const blockPasswordManager = !autoComplete || autoComplete === 'off';
    return (
        <input
            ref={ref}
            type={type}
            data-slot="input"
            className={cn(inputVariants({ size }), className)}
            autoComplete={autoComplete ?? 'off'}
            {...(blockPasswordManager ? { 'data-1p-ignore': true, 'data-lpignore': 'true', 'data-protonpass-ignore': 'true' } : {})}
            {...props}
        />
    );
});
Input.displayName = 'Input';

export { Input };
