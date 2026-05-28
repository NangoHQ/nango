import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { forwardRef } from 'react';

import { Spinner } from './spinner';
import { cn } from '../../lib/cn';

import type { VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';

export const buttonVariants = cva(
    [
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap',
        'rounded-ds-xs border-ds-hairline font-ds-medium',
        'text-ds-md leading-ds-normal',
        'tracking-ds-normal cursor-pointer select-none',
        'transition-[background-color,border-color,color,box-shadow]',
        'duration-[var(--ds-motion-duration-fast)] ease-[var(--ds-motion-easing-standard)]',
        'focus-visible:outline-none',
        'disabled:cursor-not-allowed aria-disabled:cursor-not-allowed'
    ],
    {
        variants: {
            variant: {
                primary: [
                    'bg-interactive-primary text-text-on-brand border-transparent',
                    'hover:bg-interactive-primary-hover',
                    'active:bg-interactive-primary-active',
                    'disabled:bg-interactive-disabled disabled:text-text-disabled disabled:border-transparent',
                    'aria-disabled:bg-interactive-disabled aria-disabled:text-text-disabled aria-disabled:border-transparent',
                    'focus-visible:shadow-focus-outline-default'
                ],
                secondary: [
                    'bg-surface-panel text-text-default border-border-strong',
                    'hover:bg-surface-panel-inset',
                    'active:bg-state-selected',
                    'disabled:bg-interactive-disabled disabled:text-text-disabled disabled:border-transparent',
                    'aria-disabled:bg-interactive-disabled aria-disabled:text-text-disabled aria-disabled:border-transparent',
                    'focus-visible:shadow-focus-outline-default'
                ],
                outline: [
                    'bg-interactive-outline text-text-default border-border-default',
                    'hover:bg-interactive-outline-hover hover:border-border-strong',
                    'active:bg-interactive-outline-active',
                    'disabled:bg-interactive-disabled disabled:text-text-disabled disabled:border-border-disabled',
                    'aria-disabled:bg-interactive-disabled aria-disabled:text-text-disabled aria-disabled:border-border-disabled',
                    'focus-visible:shadow-focus-outline-default'
                ],
                ghost: [
                    'bg-interactive-ghost text-text-default border-transparent',
                    'hover:bg-interactive-ghost-hover',
                    'active:bg-interactive-ghost-active',
                    'disabled:text-text-disabled',
                    'aria-disabled:text-text-disabled',
                    'focus-visible:shadow-focus-outline-default'
                ],
                danger: [
                    'bg-interactive-danger text-text-on-brand border-transparent',
                    'hover:bg-interactive-danger-hover',
                    'active:bg-interactive-danger-active',
                    'disabled:bg-interactive-disabled disabled:text-text-disabled disabled:border-transparent',
                    'aria-disabled:bg-interactive-disabled aria-disabled:text-text-disabled aria-disabled:border-transparent',
                    'focus-visible:shadow-focus-outline-danger'
                ],
                'link-danger': [
                    'bg-interactive-ghost text-text-danger border-transparent',
                    'hover:bg-interactive-ghost-hover',
                    'active:bg-interactive-ghost-active',
                    'disabled:text-text-disabled',
                    'aria-disabled:text-text-disabled',
                    'focus-visible:shadow-focus-outline-danger'
                ]
            },
            size: {
                xs: 'h-6 px-1.5 text-ds-xs',
                sm: 'h-7 px-2',
                md: 'h-8 px-2.5',
                lg: 'h-9 px-3'
            }
        },
        defaultVariants: {
            variant: 'primary',
            size: 'md'
        }
    }
);

// ─── Button ───────────────────────────────────────────────────────────────────

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
    asChild?: boolean;
    loading?: boolean;
    leadingIcon?: ReactNode;
    trailingIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, loading = false, disabled, leadingIcon, trailingIcon, children, ...props }, ref) => {
        const Comp = asChild ? Slot : 'button';
        const isDisabled = disabled || loading;

        return (
            <Comp
                ref={ref}
                type={asChild ? undefined : 'button'}
                className={cn(buttonVariants({ variant, size }), isDisabled && asChild && 'pointer-events-none', className)}
                disabled={isDisabled}
                aria-disabled={isDisabled || undefined}
                aria-busy={loading || undefined}
                {...props}
            >
                {asChild ? (
                    children
                ) : (
                    <>
                        {loading ? <Spinner size="sm" /> : leadingIcon && <span className="shrink-0 [&_svg]:size-[1em]">{leadingIcon}</span>}
                        {children}
                        {!loading && trailingIcon && <span className="shrink-0 [&_svg]:size-[1em]">{trailingIcon}</span>}
                    </>
                )}
            </Comp>
        );
    }
);

Button.displayName = 'Button';

// ─── IconButton ───────────────────────────────────────────────────────────────

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
    asChild?: boolean;
    loading?: boolean;
    /** Accessible label — applied as aria-label and title. Required for icon-only buttons. */
    label: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
    ({ className, variant, size, asChild = false, loading = false, disabled, label, children, ...props }, ref) => {
        const Comp = asChild ? Slot : 'button';
        const isDisabled = disabled || loading;
        const iconSize = size ?? 'md';

        return (
            <Comp
                ref={ref}
                type={asChild ? undefined : 'button'}
                className={cn(buttonVariants({ variant, size }), 'aspect-square px-0', isDisabled && asChild && 'pointer-events-none', className)}
                disabled={isDisabled}
                aria-disabled={isDisabled || undefined}
                aria-busy={loading || undefined}
                aria-label={label}
                title={label}
                {...props}
            >
                {!asChild && loading ? <Spinner size={iconSize} /> : children}
            </Comp>
        );
    }
);

IconButton.displayName = 'IconButton';
