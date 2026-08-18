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
                // Figma Type=Link-Accent — inline text link, no fill or box (see compoundVariants below).
                // Hover has no color of its own; states are told apart by the underline instead.
                'link-accent': [
                    'bg-transparent text-text-link border-transparent',
                    'decoration-from-font decoration-solid [text-underline-position:from-font]',
                    '[&_svg]:text-icon-link',
                    'hover:underline',
                    'active:text-text-link-active active:[&_svg]:text-icon-link-active active:underline',
                    'disabled:text-text-disabled disabled:[&_svg]:text-icon-disabled disabled:underline',
                    'aria-disabled:text-text-disabled aria-disabled:[&_svg]:text-icon-disabled aria-disabled:underline',
                    'focus-visible:shadow-focus-outline-default'
                ],
                // Figma Type=Link-Danger — same underline-based states as link-accent, darkening on active.
                'link-danger': [
                    'bg-transparent text-text-link-danger border-transparent',
                    'decoration-from-font decoration-solid [text-underline-position:from-font]',
                    '[&_svg]:text-icon-link-danger',
                    'hover:underline',
                    'active:text-text-link-danger-active active:[&_svg]:text-icon-link-danger-active active:underline',
                    'disabled:text-text-disabled disabled:[&_svg]:text-icon-disabled disabled:underline',
                    'aria-disabled:text-text-disabled aria-disabled:[&_svg]:text-icon-disabled aria-disabled:underline',
                    'focus-visible:shadow-focus-outline-danger'
                ],
                // Figma Type=Link-Neutral — unlike link-accent/link-danger, active has no color of its
                // own either; every state renders text-secondary, told apart only by the underline.
                'link-neutral': [
                    'bg-transparent text-text-secondary border-transparent',
                    'decoration-from-font decoration-solid [text-underline-position:from-font]',
                    '[&_svg]:text-icon-secondary',
                    'hover:underline',
                    'active:underline',
                    'disabled:text-text-disabled disabled:[&_svg]:text-icon-disabled disabled:underline',
                    'aria-disabled:text-text-disabled aria-disabled:[&_svg]:text-icon-disabled aria-disabled:underline',
                    'focus-visible:shadow-focus-outline-default'
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
            // Link variants are bare inline text in Figma — no fixed size, height comes from the line box.
            // link-danger alone gets 2px horizontal padding that link-accent/link-neutral don't have.
            { variant: ['link-accent', 'link-neutral'], className: 'h-auto w-auto p-0' },
            { variant: 'link-danger', className: 'h-auto w-auto px-0.5 py-0' },
            // Figma's link text/icon scale is its own two-tier scale, distinct from the solid-button sizes:
            // xs/sm render at 12px text (md/lg keep the base 14px text-ds-md, so no override needed there).
            { variant: ['link-accent', 'link-danger', 'link-neutral'], size: ['xs', 'sm'], className: 'text-ds-xs gap-1' },
            // xs is fully pill-rounded with the smallest (12px) icon; sm's icon is 14px, between xs and md/lg.
            { variant: ['link-accent', 'link-danger', 'link-neutral'], size: 'xs', className: "rounded-ds-full [&_svg:not([class*='size-'])]:size-3" },
            { variant: ['link-accent', 'link-danger', 'link-neutral'], size: 'sm', className: "[&_svg:not([class*='size-'])]:size-3.5" }
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
                {showSpinner ? (
                    <>
                        <Spinner data-spinner size="sm" />
                        {children}
                    </>
                ) : (
                    children
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
