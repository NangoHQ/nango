import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { X } from 'lucide-react';
import { forwardRef } from 'react';

import { cn } from '../../lib/cn';

import type { VariantProps } from 'class-variance-authority';

/**
 * Children are placed by column/row rather than wrapped, so call sites keep passing the icon,
 * `AlertTitle`, `AlertDescription` and `AlertActions` as flat siblings. Horizontal spacing lives on
 * the children (not `gap-x`) so that empty `auto` tracks collapse instead of leaving a gap behind.
 */
export const alertVariants = cva(
    [
        'relative grid w-full items-start gap-y-0.5',
        'rounded-ds-sm border-ds-hairline',
        // icon: 16px, nudged to sit on the first text line
        '[&>svg]:col-start-1 [&>svg]:row-start-1 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current [&>svg]:mr-2'
    ],
    {
        variants: {
            // Figma "Status". status/{s}/bg → --status-{s}-bg → bg-status-{s}-bg
            variant: {
                info: [
                    'bg-status-info-bg border-status-info-border text-status-info-text',
                    '[--alert-link:var(--color-text-link)] [--alert-link-active:var(--color-text-link-active)]'
                ],
                success: [
                    'bg-status-success-bg border-status-success-border text-status-success-text',
                    '[--alert-link:var(--color-text-link-success)] [--alert-link-active:var(--color-text-link-success-active)]'
                ],
                warning: [
                    'bg-status-warning-bg border-status-warning-border text-status-warning-text',
                    '[--alert-link:var(--color-text-link-warning)] [--alert-link-active:var(--color-text-link-warning-active)]'
                ],
                danger: [
                    'bg-status-danger-bg border-status-danger-border text-status-danger-text',
                    '[--alert-link:var(--color-text-link-danger)] [--alert-link-active:var(--color-text-link-danger-active)]'
                ],
                // Not in the Figma alerts set, but backed by the same status-neutral-* token family.
                neutral: [
                    'bg-status-neutral-bg border-status-neutral-border text-status-neutral-text',
                    '[&>svg]:text-icon-secondary [&>[data-slot=alert-title]]:text-text-strong',
                    '[--alert-link:var(--color-text-link)] [--alert-link-active:var(--color-text-link-active)]'
                ]
            },
            // Figma "Size". Each size owns where the trailing slots sit.
            size: {
                wide: [
                    'grid-cols-[auto_1fr_auto_auto] px-2 py-2',
                    '[&>[data-slot=alert-title]]:pr-3 [&>[data-slot=alert-description]]:pr-3',
                    '[&>[data-slot=alert-actions]]:col-start-3 [&>[data-slot=alert-actions]]:row-start-1 [&>[data-slot=alert-actions]]:self-center [&>[data-slot=alert-actions]]:ml-4',
                    '[&>[data-slot=alert-close]]:col-start-4 [&>[data-slot=alert-close]]:row-start-1 [&>[data-slot=alert-close]]:self-center [&>[data-slot=alert-close]]:ml-4',
                    // with a title *and* a description the alert is two rows tall — centre the trailing slots across both
                    'has-[>[data-slot=alert-title]]:has-[>[data-slot=alert-description]]:[&>[data-slot=alert-actions]]:row-span-2',
                    'has-[>[data-slot=alert-title]]:has-[>[data-slot=alert-description]]:[&>[data-slot=alert-close]]:row-span-2'
                ],
                // actions drop to their own row, aligned right under the text column; close stays top-right
                compact: [
                    'grid-cols-[auto_1fr_auto] px-2 py-2',
                    // Figma spaces compact actions 8px apart, tighter than wide's 16px
                    '[&>[data-slot=alert-actions]]:col-start-2 [&>[data-slot=alert-actions]]:w-full [&>[data-slot=alert-actions]]:justify-end [&>[data-slot=alert-actions]]:gap-2 [&>[data-slot=alert-actions]]:mt-1',
                    '[&>[data-slot=alert-close]]:col-start-3 [&>[data-slot=alert-close]]:row-start-1 [&>[data-slot=alert-close]]:self-start [&>[data-slot=alert-close]]:ml-2'
                ],
                // single line, tighter vertical padding
                // Figma colours the toast description with the status colour; we keep the description neutral at every
                // size so a titled toast still reads as coloured title + neutral body. Figma to be updated to match.
                toast: [
                    'grid-cols-[auto_1fr_auto_auto] items-center px-2 py-1',
                    '[&>svg]:translate-y-0',
                    '[&>[data-slot=alert-actions]]:col-start-3 [&>[data-slot=alert-actions]]:row-start-1 [&>[data-slot=alert-actions]]:self-center [&>[data-slot=alert-actions]]:ml-2',
                    '[&>[data-slot=alert-close]]:col-start-4 [&>[data-slot=alert-close]]:row-start-1 [&>[data-slot=alert-close]]:self-center [&>[data-slot=alert-close]]:ml-2'
                ]
            }
        },
        defaultVariants: {
            variant: 'success',
            size: 'wide'
        }
    }
);

export interface AlertProps extends React.ComponentProps<'div'>, VariantProps<typeof alertVariants> {
    /** Renders the dismiss affordance. Omit for an alert that can't be dismissed. */
    onDismiss?: () => void;
    /** Accessible label for the dismiss button. */
    dismissLabel?: string;
}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(({ className, variant, size, onDismiss, dismissLabel = 'Dismiss', children, ...props }, ref) => (
    <div ref={ref} data-slot="alert" role="alert" className={cn(alertVariants({ variant, size }), className)} {...props}>
        {children}
        {onDismiss && (
            <button
                type="button"
                data-slot="alert-close"
                aria-label={dismissLabel}
                onClick={onDismiss}
                className="cursor-pointer rounded-ds-xs text-current outline-none focus-visible:shadow-focus-outline-default"
            >
                <X className="size-4" />
            </button>
        )}
    </div>
));
Alert.displayName = 'Alert';

// Figma text/regular/sm (13px/400) in the status colour, truncated to one line.
export const AlertTitle = forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(({ className, ...props }, ref) => (
    <div ref={ref} data-slot="alert-title" className={cn('type-text-regular-sm col-start-2 row-start-1 line-clamp-1 min-h-4', className)} {...props} />
));
AlertTitle.displayName = 'AlertTitle';

// Figma text/regular/xs (12px/400). No explicit row: auto-placement puts it under the title, or on the first row when there is none.
export const AlertDescription = forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        data-slot="alert-description"
        className={cn('type-text-regular-xs col-start-2 inline-flex gap-1 text-wrap text-text-default', className)}
        {...props}
    />
));
AlertDescription.displayName = 'AlertDescription';

export const AlertActions = forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(({ className, ...props }, ref) => (
    <div ref={ref} data-slot="alert-actions" className={cn('inline-flex items-center gap-4', className)} {...props} />
));
AlertActions.displayName = 'AlertActions';

/**
 * Figma "AlertButton": borderless pill, no underline, coloured from the parent alert's status via
 * `--alert-link`, so it never has to be told which status it sits in. Inline icons render at 12px —
 * pass one (typically `ExternalLink`) at the call site.
 */
export const alertButtonVariants = cva([
    'inline-flex w-fit shrink-0 cursor-pointer items-center justify-center gap-1 whitespace-nowrap',
    'type-text-regular-sm rounded-ds-full py-0',
    'text-[var(--alert-link)] active:text-[var(--alert-link-active)]',
    'transition-colors duration-100 ease-in-out',
    'outline-none focus-visible:shadow-focus-outline-default',
    'disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3"
]);

export interface AlertButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    asChild?: boolean;
}

export const AlertButton = forwardRef<HTMLButtonElement, AlertButtonProps>(({ className, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp ref={ref} type={asChild ? undefined : 'button'} data-slot="alert-button" className={cn(alertButtonVariants(), className)} {...props} />;
});
AlertButton.displayName = 'AlertButton';
