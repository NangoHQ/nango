import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { Children, cloneElement, forwardRef, Fragment, isValidElement } from 'react';

import { cn } from '../../lib/cn';
import { Spinner } from './spinner';

import type { SpinnerSize } from './spinner';
import type { VariantProps } from 'class-variance-authority';

export const buttonVariants = cva(
    [
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
                    'hover:bg-interactive-ghost-hover active:bg-interactive-ghost-active',
                    'hover:text-text-strong active:text-text-strong',
                    'disabled:bg-interactive-ghost disabled:text-text-disabled',
                    'aria-disabled:bg-interactive-ghost aria-disabled:text-text-disabled',
                    'focus-visible:shadow-focus-outline-default'
                ],
                'danger-ghost': [
                    'bg-interactive-ghost text-text-link-danger border-transparent',
                    '[&_svg]:text-icon-link-danger',
                    'hover:bg-status-danger-bg hover:text-text-link-danger-active hover:[&_svg]:text-icon-link-danger-active',
                    'active:bg-status-danger-bg-hover active:text-text-link-danger-active active:[&_svg]:text-icon-link-danger-active',
                    'disabled:bg-interactive-ghost disabled:text-text-disabled disabled:[&_svg]:text-icon-disabled',
                    'aria-disabled:bg-interactive-ghost aria-disabled:text-text-disabled aria-disabled:[&_svg]:text-icon-disabled',
                    'focus-visible:shadow-focus-outline-danger'
                ],
                // interactive/danger → --interactive-danger → bg-interactive-danger
                danger: [
                    'bg-interactive-danger text-text-on-accent border-transparent',
                    'hover:bg-interactive-danger-hover',
                    'active:bg-interactive-danger-active',
                    'disabled:bg-interactive-disabled disabled:text-text-disabled disabled:border-transparent',
                    'aria-disabled:bg-interactive-disabled aria-disabled:text-text-disabled aria-disabled:border-transparent',
                    'focus-visible:shadow-focus-outline-danger'
                ]
            },
            size: {
                // 20px square — smallest icon-only size (use with IconButton); icon sizing comes from the base
                '2xs': 'size-5 p-1 gap-1 text-ds-xs',
                xs: ['h-6 px-2 gap-1 text-ds-xs', "[&_svg:not([class*='size-'])]:size-3"],
                sm: ['h-7 px-2.5 gap-1.5 text-ds-xs', "[&_svg:not([class*='size-'])]:size-3.5"],
                md: 'h-8 px-3 gap-1.5 text-ds-sm',
                lg: 'h-9 px-3.5 gap-2 text-ds-md'
            }
        },
        defaultVariants: {
            variant: 'primary',
            size: 'md'
        }
    }
);

// ─── Button ───────────────────────────────────────────────────────────────────

// Spinner matches each size's icon so it can stand in for the leading icon.
const SPINNER_SIZE = { '2xs': 'md', xs: 'xs', sm: 'sm', md: 'md', lg: 'md' } as const satisfies Record<
    NonNullable<VariantProps<typeof buttonVariants>['size']>,
    SpinnerSize
>;

// An icon is a raw <svg> or a component that takes no children, so `<Trans>Save</Trans>` is a label.
function isIconElement(node: React.ReactNode): boolean {
    if (!isValidElement<{ children?: React.ReactNode }>(node) || node.type === Fragment) {
        return false;
    }
    return node.type === 'svg' || (typeof node.type !== 'string' && node.props.children === undefined);
}

function flattenChildren(children: React.ReactNode): React.ReactNode[] {
    return Children.toArray(children).flatMap((child) =>
        isValidElement<{ children?: React.ReactNode }>(child) && child.type === Fragment ? flattenChildren(child.props.children) : [child]
    );
}

const spinnerOverlayClass = 'absolute inset-0 flex items-center justify-center';

// Returns the same element tree whether or not `loading` is set, so toggling it never remounts the children.
// Content is faded rather than hidden, which keeps the label as the accessible name and keeps the width.
function renderLoadingContent(children: React.ReactNode, loading: boolean, spinner: React.ReactNode): React.ReactNode {
    const [leading, ...rest] = flattenChildren(children);
    if (isIconElement(leading)) {
        return (
            <>
                <span className={cn('relative inline-flex shrink-0', loading && '[&>:first-child]:opacity-0')}>
                    {leading}
                    {loading && <span className={spinnerOverlayClass}>{spinner}</span>}
                </span>
                {/* flattened children can repeat keys across fragments */}
                {rest.map((child, i) => (
                    <Fragment key={i}>{child}</Fragment>
                ))}
            </>
        );
    }
    return (
        <>
            <span className={cn('contents', loading && 'text-transparent [&_*]:opacity-0')}>{children}</span>
            {loading && <span className={spinnerOverlayClass}>{spinner}</span>}
        </>
    );
}

interface SlotChildOptions {
    isDisabled: boolean;
    onClickCapture: React.MouseEventHandler<HTMLButtonElement> | undefined;
    renderChildren: (children: React.ReactNode) => React.ReactNode;
    props?: Record<string, unknown>;
}

// Slot merges its handlers after the child's, so the disabled guard has to live on the child itself:
// pointer-events-none stops the mouse but not Enter on a slotted link.
function renderSlotChild(child: React.ReactNode, { isDisabled, onClickCapture, renderChildren, props }: SlotChildOptions): React.ReactNode {
    if (!isValidElement<{ children?: React.ReactNode; onClickCapture?: React.MouseEventHandler<HTMLElement> }>(child)) {
        return child;
    }
    const childOnClickCapture = child.props.onClickCapture;
    const guardedClickCapture = (event: React.MouseEvent<HTMLElement>) => {
        if (isDisabled) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        childOnClickCapture?.(event);
        onClickCapture?.(event as React.MouseEvent<HTMLButtonElement>);
    };
    return cloneElement(child, { ...props, onClickCapture: guardedClickCapture }, renderChildren(child.props.children));
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
    asChild?: boolean;
    loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, loading, disabled, children, onClickCapture, ...props }, ref) => {
        const Comp = asChild ? Slot : 'button';
        const isLoading = loading === true;
        const isDisabled = disabled || isLoading;
        const spinner = <Spinner data-spinner size={SPINNER_SIZE[size ?? 'md']} />;
        // `loading` has no default: undefined means the button never loads, so its children stay unwrapped.
        const renderChildren = (inner: React.ReactNode) => (loading === undefined ? inner : renderLoadingContent(inner, isLoading, spinner));

        return (
            <Comp
                ref={ref}
                type={asChild ? undefined : 'button'}
                className={cn(buttonVariants({ variant, size }), isLoading && 'relative', isDisabled && asChild && 'pointer-events-none', className)}
                disabled={isDisabled}
                aria-disabled={isDisabled || undefined}
                aria-busy={isLoading || undefined}
                onClickCapture={asChild ? undefined : onClickCapture}
                {...props}
            >
                {asChild ? renderSlotChild(children, { isDisabled, onClickCapture, renderChildren }) : renderChildren(children)}
            </Comp>
        );
    }
);

Button.displayName = 'Button';

// ─── IconButton ───────────────────────────────────────────────────────────────

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>;

export const ICON_BUTTON_VARIANTS = ['primary', 'secondary', 'outline', 'ghost', 'danger-ghost', 'danger'] as const satisfies readonly ButtonVariant[];
export const ICON_BUTTON_SIZES = ['xs', 'sm', 'md', 'lg'] as const satisfies readonly ButtonSize[];

export type IconButtonVariant = (typeof ICON_BUTTON_VARIANTS)[number];
export type IconButtonSize = (typeof ICON_BUTTON_SIZES)[number];

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
    variant?: ButtonVariant | null;
    /** `2xs` is outside the IconButton spec and kept for existing call sites only. */
    size?: ButtonSize | null;
    asChild?: boolean;
    loading?: boolean;
    /** Accessible name, applied as `aria-label`, and as the `title` tooltip unless one is passed. */
    label: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
    ({ className, variant, size, asChild = false, loading = false, disabled, label, title, children, onClickCapture, ...props }, ref) => {
        const Comp = asChild ? Slot : 'button';
        const isDisabled = disabled || loading;
        const renderChildren = (icon: React.ReactNode) => (loading ? <Spinner data-spinner size={SPINNER_SIZE[size ?? 'md']} /> : icon);
        // Slot lets the child's own aria-label win, so `label` is set on the child itself.
        const content = asChild
            ? renderSlotChild(children, { isDisabled, onClickCapture, renderChildren, props: { 'aria-label': label } })
            : renderChildren(children);

        return (
            <Comp
                ref={ref}
                type={asChild ? undefined : 'button'}
                className={cn(buttonVariants({ variant, size }), 'aspect-square px-0', isDisabled && asChild && 'pointer-events-none', className)}
                disabled={isDisabled}
                aria-disabled={isDisabled || undefined}
                aria-busy={loading || undefined}
                title={title ?? label}
                onClickCapture={asChild ? undefined : onClickCapture}
                {...props}
                aria-label={label}
            >
                {content}
            </Comp>
        );
    }
);

IconButton.displayName = 'IconButton';
