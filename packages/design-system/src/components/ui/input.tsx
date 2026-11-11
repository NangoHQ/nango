import { cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/cn';
import { useFieldControl } from './field-context';

import type { VariantProps } from 'class-variance-authority';

/**
 * Shared look for text controls (Figma Dharma "Input Group", 2586:573). The standalone Input and the InputGroup frame
 * use the same tokens, so a bare <Input> and an <InputGroup> render identically.
 *
 * | State     | Fill               | Border                          |
 * |-----------|--------------------|---------------------------------|
 * | Default   | surface/input      | border/input                    |
 * | Hover     | surface/input      | border/inputHover               |
 * | Focus     | surface/input      | focus/ring-default, 1.5px       |
 * | Read-only | surface/inputMuted | border/default (still focusable)|
 * | Disabled  | state/disabled     | border/disabled                 |
 * | Error     | surface/input      | border/inputDanger              |
 *
 * The 1.5px focus border is the 1px border recoloured plus a 0.5px inset shadow, so the control never shifts.
 */
export const inputVariants = cva(
    [
        // Shape (Figma radius/sm, borderWidth/1)
        'flex w-full min-w-0 rounded-ds-sm border-ds-1 outline-none transition-[background-color,border-color,color,box-shadow] duration-100 ease-in-out',
        // Default
        'bg-surface-input border-border-input text-text-default placeholder:text-text-placeholder',
        // Hover — read-only keeps its muted border
        'not-read-only:hover:border-border-input-hover',
        // Read-only — :read-only also matches disabled inputs, which have their own look below
        '[&:read-only:not(:disabled)]:bg-surface-input-muted [&:read-only:not(:disabled)]:border-border-default',
        // Focus — 1px border + 0.5px inset = 1.5px, no layout shift
        'focus:border-focus-ring-default! focus:shadow-[inset_0_0_0_0.5px_var(--focus-ring-default)]',
        // Error
        'aria-invalid:border-border-input-danger! aria-invalid:hover:border-border-input-danger-hover!',
        'aria-invalid:focus:border-focus-ring-danger! aria-invalid:focus:shadow-[inset_0_0_0_0.5px_var(--focus-ring-danger)]',
        // Disabled
        'disabled:cursor-not-allowed disabled:bg-state-disabled! disabled:border-border-disabled! disabled:text-text-disabled disabled:placeholder:text-text-disabled',
        // File-input affordance
        'file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-text-default file:font-ds-medium'
    ],
    {
        variants: {
            size: {
                // 32px (Figma size md). Text sits 10px from the edge.
                md: 'h-8 px-2.5',
                // 28px (Figma size sm)
                sm: 'h-7 px-2.5',
                /** @deprecated Use `md`. Kept so existing call sites keep compiling. */
                default: 'h-8 px-2.5',
                // Hug-content — for in-popover search fields where the wrapper owns the padding
                auto: 'h-auto p-0'
            },
            // Geist Mono 12px for IDs, keys, URLs and env var names (Figma code/regular/sm). Otherwise Geist 13px (text/regular/sm).
            mono: {
                true: 'type-code-regular-sm',
                false: 'type-text-regular-sm'
            }
        },
        defaultVariants: {
            size: 'md',
            mono: false
        }
    }
);

export interface InputProps extends Omit<React.ComponentProps<'input'>, 'size'>, VariantProps<typeof inputVariants> {}

/** Keeps password managers off plain inputs unless the caller opts into an autocomplete hint. */
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
