import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { forwardRef } from 'react';

import { cn } from '../../lib/cn';
import { Spinner } from '../Spinner/Spinner';

import type { VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';

export const buttonVariants = cva(
    [
        'inline-flex items-center justify-center gap-[var(--ds-space-1-5)] whitespace-nowrap',
        'rounded-[var(--ds-radius-md)] border font-[var(--ds-typography-font-weight-medium)]',
        'text-[var(--ds-typography-font-size-sm)] leading-none cursor-pointer select-none',
        'transition-[background-color,border-color,color,box-shadow]',
        'duration-[var(--ds-motion-duration-fast)] ease-[var(--ds-motion-easing-standard)]',
        'focus-visible:outline-none',
        'disabled:cursor-not-allowed'
    ],
    {
        variants: {
            variant: {
                primary: [
                    'bg-[var(--button-primary-bg-default)] text-[var(--button-primary-text-default)]',
                    'border-[var(--button-primary-border-default)]',
                    'hover:bg-[var(--button-primary-bg-hover)]',
                    'active:bg-[var(--button-primary-bg-active)]',
                    'disabled:bg-[var(--button-primary-bg-disabled)] disabled:text-[var(--button-primary-text-disabled)] disabled:border-transparent',
                    'focus-visible:shadow-[var(--focus-outline-default)]'
                ],
                secondary: [
                    'bg-[var(--button-secondary-bg-default)] text-[var(--button-secondary-text-default)]',
                    'border-[var(--button-secondary-border-default)]',
                    'hover:bg-[var(--button-secondary-bg-hover)]',
                    'active:bg-[var(--button-secondary-bg-active)]',
                    'disabled:bg-[var(--button-secondary-bg-disabled)] disabled:text-[var(--button-secondary-text-disabled)] disabled:border-transparent',
                    'focus-visible:shadow-[var(--focus-outline-default)]'
                ],
                outline: [
                    'bg-[var(--button-outline-bg-default)] text-[var(--button-outline-text-default)]',
                    'border-[var(--button-outline-border-default)]',
                    'hover:bg-[var(--button-outline-bg-hover)] hover:border-[var(--button-outline-border-hover)]',
                    'active:bg-[var(--button-outline-bg-active)]',
                    'disabled:bg-[var(--button-outline-bg-disabled)] disabled:text-[var(--button-outline-text-disabled)] disabled:border-[var(--button-outline-border-disabled)]',
                    'focus-visible:shadow-[var(--focus-outline-default)]'
                ],
                ghost: [
                    'bg-[var(--button-ghost-bg-default)] text-[var(--button-ghost-text-default)]',
                    'border-[var(--button-ghost-border-default)]',
                    'hover:bg-[var(--button-ghost-bg-hover)]',
                    'active:bg-[var(--button-ghost-bg-active)]',
                    'disabled:bg-[var(--button-ghost-bg-disabled)] disabled:text-[var(--button-ghost-text-disabled)]',
                    'focus-visible:shadow-[var(--focus-outline-default)]'
                ],
                danger: [
                    'bg-[var(--button-danger-bg-default)] text-[var(--button-danger-text-default)]',
                    'border-[var(--button-danger-border-default)]',
                    'hover:bg-[var(--button-danger-bg-hover)]',
                    'active:bg-[var(--button-danger-bg-active)]',
                    'disabled:bg-[var(--button-danger-bg-disabled)] disabled:text-[var(--button-danger-text-disabled)] disabled:border-transparent',
                    'focus-visible:shadow-[var(--focus-outline-danger)]'
                ],
                'link-danger': [
                    'bg-[var(--button-link-danger-bg-default)] text-[var(--button-link-danger-text-default)]',
                    'border-[var(--button-link-danger-border-default)]',
                    'hover:bg-[var(--button-link-danger-bg-hover)]',
                    'active:bg-[var(--button-link-danger-bg-active)]',
                    'disabled:bg-transparent disabled:text-[var(--button-link-danger-text-disabled)]',
                    'focus-visible:shadow-[var(--focus-outline-danger)]'
                ]
            },
            size: {
                xs: 'h-6 px-[var(--ds-space-2)] text-[var(--ds-typography-font-size-xs)]',
                sm: 'h-7 px-[var(--ds-space-2-5)]',
                md: 'h-8 px-[var(--ds-space-3)]',
                lg: 'h-9 px-[var(--ds-space-3-5)]'
            }
        },
        defaultVariants: {
            variant: 'primary',
            size: 'md'
        }
    }
);

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
