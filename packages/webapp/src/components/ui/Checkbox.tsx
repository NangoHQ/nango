import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { cva } from 'class-variance-authority';
import { CheckIcon, MinusIcon } from 'lucide-react';
import * as React from 'react';

import { useFieldControl } from '@nangohq/design-system';

import { cn } from '@/utils/utils';

import type { VariantProps } from 'class-variance-authority';

// Dharma Checkbox (Figma 2595:239). Tokens only: control/checkbox/* for the unchecked outline, interactive/* once filled.
export const checkboxVariants = cva(
    [
        'peer group/checkbox inline-flex shrink-0 cursor-pointer items-center justify-center rounded-ds-xs border-ds-1 outline-none',
        'transition-[background-color,border-color,color,box-shadow] duration-100 ease-in-out',
        // Unchecked
        'border-control-checkbox-border bg-surface-input text-icon-on-accent',
        'not-disabled:hover:border-control-checkbox-border-hover',
        // Checked / indeterminate
        'data-[state=checked]:border-interactive-primary data-[state=checked]:bg-interactive-primary',
        'data-[state=indeterminate]:border-interactive-primary data-[state=indeterminate]:bg-interactive-primary',
        'data-[state=checked]:not-disabled:hover:border-interactive-primary-hover data-[state=checked]:not-disabled:hover:bg-interactive-primary-hover',
        'data-[state=indeterminate]:not-disabled:hover:border-interactive-primary-hover data-[state=indeterminate]:not-disabled:hover:bg-interactive-primary-hover',
        // Focus: halo + ring, keyboard only
        'focus-visible:shadow-focus-outline-default',
        // Disabled
        'disabled:cursor-not-allowed disabled:border-border-disabled disabled:bg-state-disabled',
        'disabled:data-[state=checked]:border-interactive-disabled disabled:data-[state=checked]:bg-interactive-disabled disabled:data-[state=checked]:text-icon-disabled',
        'disabled:data-[state=indeterminate]:border-interactive-disabled disabled:data-[state=indeterminate]:bg-interactive-disabled disabled:data-[state=indeterminate]:text-icon-disabled',
        // Error: danger outline in every checked state
        'aria-invalid:border-border-input-danger aria-invalid:not-disabled:hover:border-border-input-danger-hover',
        'aria-invalid:data-[state=checked]:border-border-input-danger aria-invalid:data-[state=indeterminate]:border-border-input-danger',
        // ...including hover, where the filled-state hover rules would otherwise swap in the primary border
        'aria-invalid:data-[state=checked]:not-disabled:hover:border-border-input-danger-hover aria-invalid:data-[state=indeterminate]:not-disabled:hover:border-border-input-danger-hover'
    ],
    {
        variants: {
            size: {
                // 16px box, 12px glyph
                md: 'size-4 [&_svg]:size-3',
                // 14px box, 10px glyph: dense lists, scope pickers, table rows
                sm: 'size-3.5 [&_svg]:size-2.5'
            }
        },
        defaultVariants: { size: 'md' }
    }
);

export type CheckboxProps = React.ComponentProps<typeof CheckboxPrimitive.Root> & VariantProps<typeof checkboxVariants>;

/**
 * `checked` accepts `true | false | "indeterminate"`. Set indeterminate from code only (a parent whose children are
 * partly selected); clicking it emits `true`, so the parent selects every child, and clicking again clears them.
 */
function Checkbox({ className, size, ...props }: CheckboxProps) {
    const fieldProps = useFieldControl(props);
    const resolvedSize = size ?? 'md';
    return (
        <CheckboxPrimitive.Root
            data-slot="checkbox"
            data-size={resolvedSize}
            className={cn(checkboxVariants({ size: resolvedSize }), className)}
            {...props}
            {...fieldProps}
        >
            <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="grid place-content-center text-current">
                <CheckIcon strokeWidth={2} className="group-data-[state=indeterminate]/checkbox:hidden" />
                <MinusIcon strokeWidth={2} className="hidden group-data-[state=indeterminate]/checkbox:block" />
            </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
    );
}

export { Checkbox };
