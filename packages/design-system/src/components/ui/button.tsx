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
        'text-ds-md leading-[var(--ds-typography-line-height-normal)]',
        'tracking-ds-normal cursor-pointer select-none',
        'transition-[background-color,border-color,color,box-shadow]',
        'duration-[var(--ds-motion-duration-fast)] ease-[var(--ds-motion-easing-standard)]',
        'focus-visible:outline-none',
        'disabled:cursor-not-allowed'
    ],
    {
        variants: {
            variant: {
                primary: [
                    'bg-button-primary-bg-default text-button-primary-text-default',
                    'border-button-primary-border-default',
                    'hover:bg-button-primary-bg-hover',
                    'active:bg-button-primary-bg-active',
                    'disabled:bg-button-primary-bg-disabled disabled:text-button-primary-text-disabled disabled:border-transparent',
                    'focus-visible:shadow-focus-outline-default'
                ],
                secondary: [
                    'bg-button-secondary-bg-default text-button-secondary-text-default',
                    'border-button-secondary-border-default',
                    'hover:bg-button-secondary-bg-hover',
                    'active:bg-button-secondary-bg-active',
                    'disabled:bg-button-secondary-bg-disabled disabled:text-button-secondary-text-disabled disabled:border-transparent',
                    'focus-visible:shadow-focus-outline-default'
                ],
                outline: [
                    'bg-button-outline-bg-default text-button-outline-text-default',
                    'border-button-outline-border-default',
                    'hover:bg-button-outline-bg-hover hover:border-button-outline-border-hover',
                    'active:bg-button-outline-bg-active',
                    'disabled:bg-button-outline-bg-disabled disabled:text-button-outline-text-disabled disabled:border-button-outline-border-disabled',
                    'focus-visible:shadow-focus-outline-default'
                ],
                ghost: [
                    'bg-button-ghost-bg-default text-button-ghost-text-default',
                    'border-button-ghost-border-default',
                    'hover:bg-button-ghost-bg-hover',
                    'active:bg-button-ghost-bg-active',
                    'disabled:bg-button-ghost-bg-disabled disabled:text-button-ghost-text-disabled',
                    'focus-visible:shadow-focus-outline-default'
                ],
                danger: [
                    'bg-button-danger-bg-default text-button-danger-text-default',
                    'border-button-danger-border-default',
                    'hover:bg-button-danger-bg-hover',
                    'active:bg-button-danger-bg-active',
                    'disabled:bg-button-danger-bg-disabled disabled:text-button-danger-text-disabled disabled:border-transparent',
                    'focus-visible:shadow-focus-outline-danger'
                ],
                'link-danger': [
                    'bg-button-link-danger-bg-default text-button-link-danger-text-default',
                    'border-button-link-danger-border-default',
                    'hover:bg-button-link-danger-bg-hover',
                    'active:bg-button-link-danger-bg-active',
                    'disabled:bg-transparent disabled:text-button-link-danger-text-disabled',
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
            <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={isDisabled} aria-busy={loading || undefined} {...props}>
                {loading ? <Spinner size="sm" /> : leadingIcon && <span className="shrink-0 [&_svg]:size-[1em]">{leadingIcon}</span>}
                {children}
                {!loading && trailingIcon && <span className="shrink-0 [&_svg]:size-[1em]">{trailingIcon}</span>}
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
        const iconSize = size === 'xs' ? 'xs' : size === 'sm' ? 'sm' : 'md';

        return (
            <Comp
                ref={ref}
                className={cn(buttonVariants({ variant, size }), 'aspect-square px-0', className)}
                disabled={isDisabled}
                aria-busy={loading || undefined}
                aria-label={label}
                title={label}
                {...props}
            >
                {loading ? <Spinner size={iconSize} /> : children}
            </Comp>
        );
    }
);

IconButton.displayName = 'IconButton';
