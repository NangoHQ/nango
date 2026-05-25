import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { forwardRef } from 'react';

import { cn } from '../../lib/cn';
import { Spinner } from '../Spinner/Spinner';

import type { VariantProps } from 'class-variance-authority';

const iconButtonVariants = cva(
    [
        'inline-flex items-center justify-center shrink-0',
        'rounded-[var(--ds-radius-xs)] border-[length:var(--ds-border-width-hairline)] cursor-pointer select-none',
        'transition-[background-color,border-color,color,box-shadow]',
        'duration-[var(--ds-motion-duration-fast)] ease-[var(--ds-motion-easing-standard)]',
        'focus-visible:outline-none',
        'disabled:cursor-not-allowed',
        '[&_svg]:shrink-0'
    ],
    {
        variants: {
            variant: {
                primary: [
                    'bg-[var(--button-primary-bg-default)] text-[var(--button-primary-icon-default)]',
                    'border-[var(--button-primary-border-default)]',
                    'hover:bg-[var(--button-primary-bg-hover)]',
                    'active:bg-[var(--button-primary-bg-active)]',
                    'disabled:bg-[var(--button-primary-bg-disabled)] disabled:text-[var(--button-primary-icon-disabled)] disabled:border-transparent',
                    'focus-visible:shadow-[var(--focus-outline-default)]'
                ],
                secondary: [
                    'bg-[var(--button-secondary-bg-default)] text-[var(--button-secondary-icon-default)]',
                    'border-[var(--button-secondary-border-default)]',
                    'hover:bg-[var(--button-secondary-bg-hover)]',
                    'active:bg-[var(--button-secondary-bg-active)]',
                    'disabled:bg-[var(--button-secondary-bg-disabled)] disabled:text-[var(--button-secondary-icon-disabled)] disabled:border-transparent',
                    'focus-visible:shadow-[var(--focus-outline-default)]'
                ],
                outline: [
                    'bg-[var(--button-outline-bg-default)] text-[var(--button-outline-icon-default)]',
                    'border-[var(--button-outline-border-default)]',
                    'hover:bg-[var(--button-outline-bg-hover)] hover:border-[var(--button-outline-border-hover)]',
                    'active:bg-[var(--button-outline-bg-active)]',
                    'disabled:bg-[var(--button-outline-bg-disabled)] disabled:text-[var(--button-outline-icon-disabled)] disabled:border-[var(--button-outline-border-disabled)]',
                    'focus-visible:shadow-[var(--focus-outline-default)]'
                ],
                ghost: [
                    'bg-[var(--button-ghost-bg-default)] text-[var(--button-ghost-icon-default)]',
                    'border-[var(--button-ghost-border-default)]',
                    'hover:bg-[var(--button-ghost-bg-hover)]',
                    'active:bg-[var(--button-ghost-bg-active)]',
                    'disabled:bg-[var(--button-ghost-bg-disabled)] disabled:text-[var(--button-ghost-icon-disabled)]',
                    'focus-visible:shadow-[var(--focus-outline-default)]'
                ],
                danger: [
                    'bg-[var(--button-danger-bg-default)] text-[var(--button-danger-icon-default)]',
                    'border-[var(--button-danger-border-default)]',
                    'hover:bg-[var(--button-danger-bg-hover)]',
                    'active:bg-[var(--button-danger-bg-active)]',
                    'disabled:bg-[var(--button-danger-bg-disabled)] disabled:text-[var(--button-danger-icon-disabled)] disabled:border-transparent',
                    'focus-visible:shadow-[var(--focus-outline-danger)]'
                ]
            },
            size: {
                xxs: 'size-5',
                xs: 'size-6',
                sm: 'size-7',
                md: 'size-8',
                lg: 'size-9'
            }
        },
        defaultVariants: {
            variant: 'ghost',
            size: 'md'
        }
    }
);

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof iconButtonVariants> {
    asChild?: boolean;
    loading?: boolean;
    label: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
    ({ className, variant, size, asChild = false, loading = false, disabled, label, children, ...props }, ref) => {
        const Comp = asChild ? Slot : 'button';
        const isDisabled = disabled || loading;
        const iconSize = size === 'xxs' || size === 'xs' ? 'xs' : size === 'sm' ? 'sm' : 'md';

        return (
            <Comp
                ref={ref}
                className={cn(iconButtonVariants({ variant, size }), className)}
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
