import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { forwardRef } from 'react';

import { cn } from '../../lib/cn';
import { Spinner } from './spinner';

import type { VariantProps } from 'class-variance-authority';

export const buttonVariants = cva(
    [
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap',
        'rounded-ds-xs border-ds-hairline font-ds-medium',
        'text-ds-md leading-ds-normal',
        'tracking-ds-normal cursor-pointer select-none',
        'transition-[background-color,border-color,color,box-shadow]',
        // native equivalents of --ds-motion-duration-fast (100ms) and --ds-motion-easing-standard
        'duration-100 ease-in-out',
        'focus-visible:outline-none',
        'disabled:cursor-not-allowed aria-disabled:cursor-not-allowed',
        // inline icons auto-size to 16px unless they set an explicit size-* class (matches shadcn / the old webapp button)
        "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0"
    ],
    {
        variants: {
            variant: {
                // Figma token → CSS var → Tailwind class
                // interactive/primary → --interactive-primary → bg-interactive-primary
                primary: [
                    'bg-interactive-primary text-text-on-accent border-transparent',
                    'hover:bg-interactive-primary-hover',
                    'active:bg-interactive-primary-active',
                    'disabled:bg-interactive-disabled disabled:text-text-disabled disabled:border-transparent',
                    'aria-disabled:bg-interactive-disabled aria-disabled:text-text-disabled aria-disabled:border-transparent',
                    'focus-visible:shadow-focus-outline-default'
                ],
                // surface/inverse → --surface-inverse → bg-surface-inverse
                secondary: [
                    'bg-surface-inverse text-text-inverse border-transparent',
                    'hover:bg-surface-inverse-hover',
                    'active:bg-surface-inverse-pressed',
                    'disabled:bg-interactive-disabled disabled:text-text-disabled disabled:border-transparent',
                    'aria-disabled:bg-interactive-disabled aria-disabled:text-text-disabled aria-disabled:border-transparent',
                    'focus-visible:shadow-focus-outline-default'
                ],
                // interactive/outline → --interactive-outline → bg-interactive-outline
                // border/input → --border-input → border-border-input (border.interactive was removed from the token set)
                outline: [
                    'bg-interactive-outline text-text-default border-border-input',
                    'hover:bg-interactive-outline-hover hover:border-border-input-hover',
                    'active:bg-interactive-outline-active',
                    'disabled:bg-interactive-disabled disabled:text-text-disabled disabled:border-transparent',
                    'aria-disabled:bg-interactive-disabled aria-disabled:text-text-disabled aria-disabled:border-transparent',
                    'focus-visible:shadow-focus-outline-default'
                ],
                // interactive/ghost → --interactive-ghost → bg-interactive-ghost
                // text/secondary → --text-secondary → text-text-secondary
                ghost: [
                    'bg-interactive-ghost text-text-secondary border-transparent',
                    // hover/active give feedback via icon/text colour, not a background fill
                    'hover:text-text-strong active:text-text-strong',
                    'disabled:text-text-disabled',
                    'aria-disabled:text-text-disabled',
                    'focus-visible:shadow-focus-outline-default'
                ],
                // interactive/danger → --interactive-danger → bg-interactive-danger
                danger: [
                    'bg-interactive-danger text-text-on-accent border-transparent',
                    'hover:bg-interactive-danger-hover',
                    'active:bg-interactive-danger-active',
                    'disabled:bg-interactive-disabled disabled:text-text-disabled disabled:border-transparent',
                    'aria-disabled:bg-interactive-disabled aria-disabled:text-text-disabled aria-disabled:border-transparent',
                    'focus-visible:shadow-focus-outline-danger'
                ],
                // Figma Type=Link — inline text link, no fill and no box (see compoundVariants below).
                // text/default → --text-default → text-text-default; Figma keeps the same colour across hover/active.
                link: [
                    'bg-transparent text-text-default border-transparent',
                    'disabled:text-text-disabled',
                    'aria-disabled:text-text-disabled',
                    'focus-visible:shadow-focus-outline-default'
                ],
                // Figma Type=Link-Destructive — text/linkDanger → --text-link-danger, brightening to text/danger on hover
                'link-danger': [
                    'bg-transparent text-text-link-danger border-transparent',
                    'hover:text-text-danger',
                    'active:text-text-link-danger',
                    'disabled:text-text-disabled',
                    'aria-disabled:text-text-disabled',
                    'focus-visible:shadow-focus-outline-danger'
                ]
            },
            size: {
                // 20px square — smallest icon-only size (use with IconButton); icon sizing comes from the base
                '2xs': 'size-5 p-1',
                xs: 'h-6 px-1.5 text-ds-xs',
                sm: 'h-7 px-2',
                md: 'h-8 px-2.5',
                lg: 'h-9 px-3'
            }
        },
        compoundVariants: [
            // Link variants render as bare inline text in Figma: no padding, height from the line box,
            // 12px medium text and 16px icons at every size (the Figma size axis is inert for links)
            {
                variant: ['link', 'link-danger'],
                className: 'h-auto w-auto p-0 text-ds-xs'
            }
        ],
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
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
        const Comp = asChild ? Slot : 'button';
        const isDisabled = disabled || loading;
        // While loading, show the spinner and hide inline icons (text stays). Skipped for asChild — Slot needs a single child.
        const showSpinner = loading && !asChild;

        return (
            <Comp
                ref={ref}
                type={asChild ? undefined : 'button'}
                className={cn(
                    buttonVariants({ variant, size }),
                    showSpinner && '[&_svg:not([data-spinner])]:hidden',
                    isDisabled && asChild && 'pointer-events-none',
                    className
                )}
                disabled={isDisabled}
                aria-disabled={isDisabled || undefined}
                aria-busy={loading || undefined}
                {...props}
            >
                {showSpinner && <Spinner data-spinner size="sm" />}
                {children}
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
        // Spinner has no 2xs size; clamp to xs for the loading indicator
        const iconSize = size === '2xs' ? 'xs' : (size ?? 'md');

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
                {loading ? <Spinner size={iconSize} /> : children}
            </Comp>
        );
    }
);

IconButton.displayName = 'IconButton';
