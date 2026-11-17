import { cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/cn';
import { useFieldControl } from './field-context';

import type { VariantProps } from 'class-variance-authority';

export const inputVariants = cva(
    [
        'flex w-full min-w-0 rounded-ds-sm border-ds-1 outline-none transition-[background-color,border-color,color,box-shadow] duration-100 ease-in-out',
        'bg-surface-input border-border-input text-text-default placeholder:text-text-placeholder',
        'not-read-only:hover:border-border-input-hover',
        '[&:read-only:not(:disabled)]:bg-surface-input-muted [&:read-only:not(:disabled)]:border-border-default',
        // 1px border plus a 0.5px inset makes the 1.5px focus border without shifting the layout
        'focus:border-focus-ring-default! focus:shadow-[inset_0_0_0_0.5px_var(--focus-ring-default)]',
        'aria-invalid:not-disabled:border-border-input-danger! aria-invalid:not-disabled:not-focus:hover:border-border-input-danger-hover!',
        'aria-invalid:focus:border-focus-ring-danger! aria-invalid:focus:shadow-[inset_0_0_0_0.5px_var(--focus-ring-danger)]',
        'disabled:cursor-not-allowed disabled:bg-state-disabled! disabled:border-border-disabled! disabled:text-text-disabled disabled:placeholder:text-text-disabled',
        // File-input affordance
        'file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-text-default file:font-ds-medium'
    ],
    {
        variants: {
            size: {
                md: 'h-8 px-2.5',
                sm: 'h-7 px-2.5',
                /** @deprecated Use `md`. */
                default: 'h-8 px-2.5',
                // Hug-content — for in-popover search fields where the wrapper owns the padding
                auto: 'h-auto p-0'
            },
            mono: {
                true: 'font-mono text-ds-xs font-ds-regular leading-ds-normal',
                false: 'font-sans text-ds-sm font-ds-regular leading-ds-normal'
            }
        },
        defaultVariants: {
            size: 'md',
            mono: false
        }
    }
);

export interface InputProps extends Omit<React.ComponentProps<'input'>, 'size'>, VariantProps<typeof inputVariants> {}

export function passwordManagerProps(autoComplete: string | undefined): Record<string, string | boolean> {
    const block = !autoComplete || autoComplete === 'off';
    return block ? { 'data-1p-ignore': true, 'data-lpignore': 'true', 'data-protonpass-ignore': 'true' } : {};
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, size, mono, autoComplete, ...props }, ref) => {
    const fieldProps = useFieldControl(props);
    return (
        <input
            ref={ref}
            type={type}
            data-slot="input"
            className={cn(inputVariants({ size, mono }), className)}
            autoComplete={autoComplete ?? 'off'}
            {...passwordManagerProps(autoComplete)}
            {...props}
            {...fieldProps}
        />
    );
});
Input.displayName = 'Input';

export { Input };
