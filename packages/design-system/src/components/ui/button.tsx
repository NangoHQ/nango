import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { Children, forwardRef, Fragment, isValidElement } from 'react';

import { cn } from '../../lib/cn';
import { Spinner } from './spinner';

import type { SpinnerSize } from './spinner';
import type { VariantProps } from 'class-variance-authority';

// Disabled controls still receive pointer events — the base keeps them so `cursor-not-allowed` shows — so
// a disabled link would underline on hover without this guard. Guarding the trigger beats re-setting
// `no-underline` on top, which would depend on the order Tailwind emits the two utilities in.
const LINK_UNDERLINE_STATES = [
    'not-disabled:not-aria-disabled:hover:underline',
    'not-disabled:not-aria-disabled:focus-visible:underline',
    'not-disabled:not-aria-disabled:active:underline'
];

export const buttonVariants = cva(
    [
        // gap and font size come from the size variant (Figma's per-size spec)
        'inline-flex items-center justify-center whitespace-nowrap',
        'rounded-ds-sm border-ds-hairline font-ds-medium',
        'leading-ds-normal',
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
                // border/strong → --border-strong → border-border-strong, darkening to border/stronger on hover
                outline: [
                    'bg-interactive-outline text-text-strong border-border-strong',
                    'hover:bg-interactive-outline-hover hover:border-border-stronger',
                    'active:bg-interactive-outline-active',
                    'disabled:bg-interactive-disabled disabled:text-text-disabled disabled:border-transparent',
                    'aria-disabled:bg-interactive-disabled aria-disabled:text-text-disabled aria-disabled:border-transparent',
                    'focus-visible:shadow-focus-outline-default'
                ],
                // interactive/ghost → --interactive-ghost → bg-interactive-ghost
                // text/secondary → --text-secondary → text-text-secondary
                ghost: [
                    'bg-interactive-ghost text-text-secondary border-transparent',
                    // hover/active fill with the ghost tokens and lift the text to text/strong
                    'hover:bg-interactive-ghost-hover active:bg-interactive-ghost-active',
                    'hover:text-text-strong active:text-text-strong',
                    'disabled:bg-interactive-ghost disabled:text-text-disabled',
                    'aria-disabled:bg-interactive-ghost aria-disabled:text-text-disabled',
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
                // Hover has no color of its own; hover/focus/active are told apart by the underline, and disabled
                // deliberately drops it so it can't be mistaken for an interactive state.
                'link-accent': [
                    'bg-transparent text-text-link border-transparent',
                    'decoration-from-font decoration-solid [text-underline-position:from-font]',
                    '[&_svg]:text-icon-link',
                    ...LINK_UNDERLINE_STATES,
                    'active:text-text-link-active active:[&_svg]:text-icon-link-active',
                    'disabled:text-text-disabled disabled:[&_svg]:text-icon-disabled',
                    'aria-disabled:text-text-disabled aria-disabled:[&_svg]:text-icon-disabled',
                    'focus-visible:shadow-focus-outline-default'
                ],
                // Figma Type=Link-Danger — same underline-based states as link-accent, darkening on active.
                'link-danger': [
                    'bg-transparent text-text-link-danger border-transparent',
                    'decoration-from-font decoration-solid [text-underline-position:from-font]',
                    '[&_svg]:text-icon-link-danger',
                    ...LINK_UNDERLINE_STATES,
                    'active:text-text-link-danger-active active:[&_svg]:text-icon-link-danger-active',
                    'disabled:text-text-disabled disabled:[&_svg]:text-icon-disabled',
                    'aria-disabled:text-text-disabled aria-disabled:[&_svg]:text-icon-disabled',
                    'focus-visible:shadow-focus-outline-danger'
                ],
                // Figma Type=Link-Neutral — resting and hover both render text-secondary, told apart only by
                // the underline; active darkens to text-strong.
                'link-neutral': [
                    'bg-transparent text-text-link-neutral border-transparent',
                    'decoration-from-font decoration-solid [text-underline-position:from-font]',
                    '[&_svg]:text-icon-link-neutral',
                    ...LINK_UNDERLINE_STATES,
                    'active:text-text-link-neutral-active active:[&_svg]:text-icon-link-neutral-active',
                    'disabled:text-text-disabled disabled:[&_svg]:text-icon-disabled',
                    'aria-disabled:text-text-disabled aria-disabled:[&_svg]:text-icon-disabled',
                    'focus-visible:shadow-focus-outline-default'
                ],
                'link-neutral-danger': [
                    'bg-transparent text-text-link-neutral border-transparent',
                    'decoration-from-font decoration-solid [text-underline-position:from-font]',
                    '[&_svg]:text-icon-link-neutral',
                    ...LINK_UNDERLINE_STATES,
                    'not-disabled:not-aria-disabled:hover:text-text-link-danger not-disabled:not-aria-disabled:hover:[&_svg]:text-icon-link-danger',
                    'not-disabled:not-aria-disabled:focus-visible:text-text-link-danger not-disabled:not-aria-disabled:focus-visible:[&_svg]:text-icon-link-danger',
                    'not-disabled:not-aria-disabled:active:text-text-link-danger-active not-disabled:not-aria-disabled:active:[&_svg]:text-icon-link-danger-active',
                    'disabled:text-text-disabled disabled:[&_svg]:text-icon-disabled',
                    'aria-disabled:text-text-disabled aria-disabled:[&_svg]:text-icon-disabled',
                    'focus-visible:shadow-focus-outline-danger'
                ]
            },
            size: {
                // 20px square — smallest icon-only size (use with IconButton); icon sizing comes from the base
                '2xs': 'size-5 p-1 gap-1 text-ds-xs',
                // Figma Dharma button spec — height / side padding / label / icon / gap:
                // xs 24 / 8 / 12 / 12 / 4
                xs: ['h-6 px-2 gap-1 text-ds-xs', "[&_svg:not([class*='size-'])]:size-3"],
                // sm 28 / 10 / 12 / 14 / 6
                sm: ['h-7 px-2.5 gap-1.5 text-ds-xs', "[&_svg:not([class*='size-'])]:size-3.5"],
                // md 32 / 12 / 13 / 16 / 6 (16px icon from the base)
                md: 'h-8 px-3 gap-1.5 text-ds-sm',
                // lg 36 / 14 / 14 / 16 / 8 (16px icon from the base)
                lg: 'h-9 px-3.5 gap-2 text-ds-md'
            }
        },
        compoundVariants: [
            // Link variants are bare inline text in Figma — no fixed size, height comes from the line box.
            // link-danger alone gets 2px horizontal padding that link-accent/link-neutral don't have.
            { variant: ['link-accent', 'link-neutral', 'link-neutral-danger'], className: 'h-auto w-auto p-0' },
            { variant: 'link-danger', className: 'h-auto w-auto px-0.5 py-0' },
            // Link variants deliberately don't take the size scale's radius, gap or label size, only its icon size.
            { variant: ['link-accent', 'link-danger', 'link-neutral', 'link-neutral-danger'], className: 'rounded-ds-xs' },
            { variant: ['link-accent', 'link-danger', 'link-neutral', 'link-neutral-danger'], size: 'sm', className: 'gap-1' },
            { variant: ['link-accent', 'link-danger', 'link-neutral', 'link-neutral-danger'], size: 'md', className: 'text-ds-md' },
            { variant: ['link-accent', 'link-danger', 'link-neutral', 'link-neutral-danger'], size: 'lg', className: 'gap-1.5' }
        ],
        defaultVariants: {
            variant: 'primary',
            size: 'md'
        }
    }
);

// ─── Button ───────────────────────────────────────────────────────────────────

// Spinner matches each size's icon (xs 12, sm 14, md/lg 16) so it can stand in for the leading icon.
const SPINNER_SIZE = { '2xs': 'xs', xs: 'xs', sm: 'sm', md: 'md', lg: 'md' } as const satisfies Record<
    NonNullable<VariantProps<typeof buttonVariants>['size']>,
    SpinnerSize
>;

// A leading icon is a component element (e.g. a lucide icon) or a raw <svg>. Text labels are strings or
// plain HTML elements like <span>, so they don't count.
function isIconElement(node: React.ReactNode): boolean {
    return isValidElement(node) && node.type !== Fragment && (typeof node.type !== 'string' || node.type === 'svg');
}

// Children with any fragments expanded, so `<><Icon />Label</>` is seen as [Icon, 'Label'], not one element.
function flattenChildren(children: React.ReactNode): React.ReactNode[] {
    return Children.toArray(children).flatMap((child) =>
        isValidElement<{ children?: React.ReactNode }>(child) && child.type === Fragment ? flattenChildren(child.props.children) : [child]
    );
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
    asChild?: boolean;
    loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
        const Comp = asChild ? Slot : 'button';
        const isDisabled = disabled || loading;
        // Loading never changes the button's width. Skipped for asChild — Slot needs a single child.
        //  - With a leading icon: a same-size spinner takes the icon's slot; the label stays visible.
        //  - Without one: the content stays in the layout but invisible, and the spinner sits centred on top.
        const showSpinner = loading && !asChild;
        const spinner = <Spinner data-spinner size={SPINNER_SIZE[size ?? 'md']} />;
        const [leading, ...rest] = flattenChildren(children);
        const swapsLeadingIcon = showSpinner && isIconElement(leading);

        let content: React.ReactNode = children;
        if (swapsLeadingIcon) {
            content = (
                <>
                    {spinner}
                    {/* flattened children can repeat keys across fragments, so re-key by position */}
                    {rest.map((child, i) => (
                        <Fragment key={i}>{child}</Fragment>
                    ))}
                </>
            );
        } else if (showSpinner) {
            content = (
                <>
                    {/* display:contents keeps the children as flex items (same width); visibility is inherited */}
                    <span className="contents invisible">{children}</span>
                    <span className="absolute inset-0 flex items-center justify-center">{spinner}</span>
                </>
            );
        }

        return (
            <Comp
                ref={ref}
                type={asChild ? undefined : 'button'}
                className={cn(
                    buttonVariants({ variant, size }),
                    showSpinner && !swapsLeadingIcon && 'relative',
                    isDisabled && asChild && 'pointer-events-none',
                    className
                )}
                disabled={isDisabled}
                aria-disabled={isDisabled || undefined}
                aria-busy={loading || undefined}
                {...props}
            >
                {content}
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
