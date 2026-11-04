import { Slot, Slottable } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { forwardRef } from 'react';

import { cn } from '../../lib/cn';
import { Spinner } from './spinner';

import type { SpinnerSize } from './spinner';
import type { VariantProps } from 'class-variance-authority';

// Disabled controls still receive pointer events (the base keeps them so `cursor-not-allowed` shows), so
// guard the underline trigger instead of re-setting `no-underline` on top — that would depend on the order
// Tailwind emits the two utilities in.
const UNDERLINE_ON_HOVER_AND_PRESSED = ['not-disabled:not-aria-disabled:hover:underline', 'not-disabled:not-aria-disabled:active:underline'];

export const linkButtonVariants = cva(
    [
        // Inline text link: no height or padding, the line box sets the size.
        'inline-flex items-center whitespace-nowrap p-0',
        'rounded-ds-xs bg-transparent font-ds-medium leading-ds-normal tracking-ds-normal',
        'cursor-pointer select-none',
        'decoration-from-font decoration-solid [text-underline-position:from-font]',
        ...UNDERLINE_ON_HOVER_AND_PRESSED,
        'transition-[color,box-shadow] duration-100 ease-in-out',
        'focus-visible:outline-none',
        'disabled:cursor-not-allowed aria-disabled:cursor-not-allowed',
        'disabled:text-text-disabled aria-disabled:text-text-disabled',
        'disabled:[&_svg]:text-icon-disabled aria-disabled:[&_svg]:text-icon-disabled',
        '[&_svg]:pointer-events-none [&_svg]:shrink-0'
    ],
    {
        variants: {
            tone: {
                // text/link → --text-link → text-text-link
                accent: [
                    'text-text-link [&_svg]:text-icon-link',
                    'active:text-text-link-active active:[&_svg]:text-icon-link-active',
                    'focus-visible:shadow-focus-outline-default'
                ],
                neutral: [
                    'text-text-link-neutral [&_svg]:text-icon-link-neutral',
                    'active:text-text-link-neutral-active active:[&_svg]:text-icon-link-neutral-active',
                    'focus-visible:shadow-focus-outline-default'
                ],
                danger: [
                    'text-text-link-danger [&_svg]:text-icon-link-danger',
                    'active:text-text-link-danger-active active:[&_svg]:text-icon-link-danger-active',
                    'focus-visible:shadow-focus-outline-danger'
                ],
                // No text/link-info token yet: status/info/text and status/info/strong are the closest match.
                // info, success and warning have no icon/link-* tokens either, so icons follow the text colour
                // (lucide icons use currentColor).
                info: ['text-status-info-text', 'active:text-status-info-strong', 'focus-visible:shadow-focus-outline-default'],
                success: ['text-text-link-success', 'active:text-text-link-success-active', 'focus-visible:shadow-focus-outline-default'],
                warning: ['text-text-link-warning', 'active:text-text-link-warning-active', 'focus-visible:shadow-focus-outline-default']
            },
            size: {
                // label / icon / gap
                // sm 12 / 12 / 4
                sm: "gap-1 text-ds-xs [&_svg:not([class*='size-'])]:size-3",
                // md 13 / 14 / 6
                md: "gap-1.5 text-ds-sm [&_svg:not([class*='size-'])]:size-3.5",
                // lg 14 / 16 / 6
                lg: "gap-1.5 text-ds-md [&_svg:not([class*='size-'])]:size-4"
            }
        },
        defaultVariants: {
            tone: 'accent',
            size: 'md'
        }
    }
);

// Spinner matches each size's icon (sm 12, md 14, lg 16) so it can stand in for the left icon.
const SPINNER_SIZE = { sm: 'xs', md: 'sm', lg: 'md' } as const satisfies Record<NonNullable<VariantProps<typeof linkButtonVariants>['size']>, SpinnerSize>;

export interface LinkButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof linkButtonVariants> {
    /** Render the single child (e.g. a router `<Link>` or `<a>`) instead of a `<button>`, keeping the styles. */
    asChild?: boolean;
    /**
     * Disables the link and shows a spinner without changing its width: the spinner replaces `leftIcon` when
     * there is one, otherwise it's centred over the hidden label. Ignored with `asChild`.
     */
    loading?: boolean;
    /** Icon before the label. Sized by `size` unless it sets its own `size-*` class. */
    leftIcon?: React.ReactNode;
    /** Icon after the label. Sized by `size` unless it sets its own `size-*` class. */
    rightIcon?: React.ReactNode;
}

export const LinkButton = forwardRef<HTMLButtonElement, LinkButtonProps>(
    ({ className, tone, size, asChild = false, loading = false, leftIcon, rightIcon, disabled, onClick, children, ...props }, ref) => {
        const Comp = asChild ? Slot : 'button';
        const isDisabled = disabled || loading;
        const showSpinner = loading && !asChild;
        const swapsLeftIcon = showSpinner && Boolean(leftIcon);
        const spinner = <Spinner data-spinner size={SPINNER_SIZE[size ?? 'md']} />;

        let content: React.ReactNode = (
            <>
                {swapsLeftIcon ? spinner : leftIcon}
                <Slottable>{children}</Slottable>
                {rightIcon}
            </>
        );
        if (showSpinner && !swapsLeftIcon) {
            content = (
                <>
                    {/* display:contents keeps the children as flex items (same width); visibility is inherited */}
                    <span className="contents invisible">{content}</span>
                    <span className="absolute inset-0 flex items-center justify-center">{spinner}</span>
                </>
            );
        }

        return (
            <Comp
                ref={ref}
                type={asChild ? undefined : 'button'}
                className={cn(
                    linkButtonVariants({ tone, size }),
                    showSpinner && !swapsLeftIcon && 'relative',
                    isDisabled && asChild && 'pointer-events-none',
                    className
                )}
                // `disabled` does nothing on a non-form element, so with asChild the state is carried by aria-disabled
                // plus pointer/tab removal. The handler is swallowed too: pointer-events and tabIndex don't stop a
                // programmatic click, or an Enter press on an anchor something else has focused.
                disabled={asChild ? undefined : isDisabled}
                aria-disabled={isDisabled || undefined}
                aria-busy={loading || undefined}
                tabIndex={isDisabled && asChild ? -1 : undefined}
                onClick={
                    isDisabled
                        ? (event) => {
                              event.preventDefault();
                              event.stopPropagation();
                          }
                        : onClick
                }
                {...props}
            >
                {content}
            </Comp>
        );
    }
);

LinkButton.displayName = 'LinkButton';
