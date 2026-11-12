import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { forwardRef, useState } from 'react';

import { cn } from '../../lib/cn';
import { Button } from './button';
import { InlineCodeToneProvider } from './inline-code';

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
        // 16px icon, top-aligned so it stays on the first line when the description wraps. Each size nudges
        // it down to sit optically centred on that line — see the size variants for the amounts.
        // Figma colours the icon from status/{s}/icon, a more vibrant stop than the status text colour, so it
        // takes --alert-icon rather than inheriting currentColor.
        '[&>svg]:col-start-1 [&>svg]:row-start-1 [&>svg]:size-4 [&>svg]:text-[var(--alert-icon)] [&>svg]:mr-2'
    ],
    {
        variants: {
            // Figma "Status". status/{s}/bg → --status-{s}-bg → bg-status-{s}-bg
            variant: {
                info: [
                    'bg-status-info-bg border-status-info-border text-status-info-text',
                    '[--alert-icon:var(--color-status-info-icon)]',
                    '[--alert-link:var(--color-text-link)] [--alert-link-active:var(--color-text-link-active)]'
                ],
                success: [
                    'bg-status-success-bg border-status-success-border text-status-success-text',
                    '[--alert-icon:var(--color-status-success-icon)]',
                    '[--alert-link:var(--color-text-link-success)] [--alert-link-active:var(--color-text-link-success-active)]'
                ],
                warning: [
                    'bg-status-warning-bg border-status-warning-border text-status-warning-text',
                    '[--alert-icon:var(--color-status-warning-icon)]',
                    '[--alert-link:var(--color-text-link-warning)] [--alert-link-active:var(--color-text-link-warning-active)]'
                ],
                danger: [
                    'bg-status-danger-bg border-status-danger-border text-status-danger-text',
                    '[--alert-icon:var(--color-status-danger-icon)]',
                    '[--alert-link:var(--color-text-link-danger)] [--alert-link-active:var(--color-text-link-danger-active)]'
                ],
                neutral: [
                    'bg-status-neutral-bg border-status-neutral-border text-status-neutral-text',
                    '[--alert-icon:var(--color-status-neutral-icon)]',
                    '[--alert-link:var(--color-text-link-neutral)] [--alert-link-active:var(--color-text-link-neutral-active)]'
                ]
            },
            // `status` follows the variant; `success` recolours only the icon.
            icon: {
                status: '',
                success: '[--alert-icon:var(--color-icon-success)]'
            },
            // Figma "Size". Each size owns where the trailing slots sit.
            size: {
                wide: [
                    'grid-cols-[auto_1fr_auto_auto] px-2 py-2',
                    // 1px centres the 16px icon on a 12px description line (18px box); a 13px title line
                    // (19.5px box) needs 2px. Nudged rather than centred so it stays on the first line.
                    '[&>svg]:translate-y-px has-[>[data-slot=alert-title]]:[&>svg]:translate-y-0.5',
                    '[&>[data-slot=alert-title]]:pr-3 [&>[data-slot=alert-description]]:pr-3',
                    '[&>[data-slot=alert-actions]]:col-start-3 [&>[data-slot=alert-actions]]:row-start-1 [&>[data-slot=alert-actions]]:self-center [&>[data-slot=alert-actions]]:ml-4',
                    // Figma leaves 16px between the trailing slot and the right border, 8px more than the root
                    // padding, so whichever slot comes last takes the extra 8px.
                    '[&>[data-slot=alert-close]]:col-start-4 [&>[data-slot=alert-close]]:row-start-1 [&>[data-slot=alert-close]]:self-center [&>[data-slot=alert-close]]:ml-4 [&>[data-slot=alert-close]]:mr-2',
                    'not-has-[>[data-slot=alert-close]]:[&>[data-slot=alert-actions]]:mr-2',
                    // With a title *and* a description the alert is two rows tall; the trailing slots span both so they
                    // centre on the banner. Start and span go in one `grid-row` declaration — a separate `row-span-2`
                    // emits the shorthand, which resets the `row-start-1` above and drops them into the second row.
                    'has-[>[data-slot=alert-title]]:has-[>[data-slot=alert-description]]:[&>[data-slot=alert-actions]]:row-[1/span_2]',
                    'has-[>[data-slot=alert-title]]:has-[>[data-slot=alert-description]]:[&>[data-slot=alert-close]]:row-[1/span_2]'
                ],
                // actions drop to their own row, aligned right under the text column; close stays top-right
                compact: [
                    'grid-cols-[auto_1fr_auto] px-2 py-2',
                    // 1px centres a 16px glyph on a 12px description line (18px box); a 13px title line
                    // (19.5px box) needs 2px. Nudged rather than centred so it stays on the first line.
                    '[&>svg]:translate-y-px has-[>[data-slot=alert-title]]:[&>svg]:translate-y-0.5',
                    '[&>[data-slot=alert-close]]:translate-y-px has-[>[data-slot=alert-title]]:[&>[data-slot=alert-close]]:translate-y-0.5',
                    // Actions sit left-aligned under the text, 8px apart — tighter than wide's 16px.
                    '[&>[data-slot=alert-actions]]:col-start-2 [&>[data-slot=alert-actions]]:gap-2 [&>[data-slot=alert-actions]]:mt-1',
                    '[&>[data-slot=alert-close]]:col-start-3 [&>[data-slot=alert-close]]:row-start-1 [&>[data-slot=alert-close]]:self-start [&>[data-slot=alert-close]]:ml-2'
                ],
                toast: [
                    'grid-cols-[auto_1fr_auto_auto] px-2 py-2',
                    // Figma tightens the toast to 4px as soon as it carries a title; description-only keeps the standard 8px.
                    'has-[>[data-slot=alert-title]]:py-1',
                    // Figma "CTA": the action sits inline at the end of the description row, or beneath it when
                    // there is a title.
                    '[&>[data-slot=alert-actions]]:col-start-3 [&>[data-slot=alert-actions]]:row-start-1 [&>[data-slot=alert-actions]]:self-start [&>[data-slot=alert-actions]]:gap-2 [&>[data-slot=alert-actions]]:ml-2',
                    'has-[>[data-slot=alert-title]]:[&>[data-slot=alert-actions]]:col-start-2 has-[>[data-slot=alert-title]]:[&>[data-slot=alert-actions]]:row-start-auto has-[>[data-slot=alert-title]]:[&>[data-slot=alert-actions]]:ml-0',
                    '[&>[data-slot=alert-close]]:col-start-4 [&>[data-slot=alert-close]]:row-start-1 [&>[data-slot=alert-close]]:self-start [&>[data-slot=alert-close]]:ml-2',
                    // A title or an inline action makes the first row taller than a bare description line, so the
                    // icon and close need 2px there instead of 1 to stay optically centred on it.
                    '[&>svg]:translate-y-px [&>[data-slot=alert-close]]:translate-y-px',
                    'has-[>[data-slot=alert-title]]:[&>svg]:translate-y-0.5 has-[>[data-slot=alert-title]]:[&>[data-slot=alert-close]]:translate-y-0.5',
                    'has-[>[data-slot=alert-actions]]:[&>svg]:translate-y-0.5 has-[>[data-slot=alert-actions]]:[&>[data-slot=alert-close]]:translate-y-0.5'
                ]
            },
            // Renders no Button itself: the call site passes a primary <Button size="md"> in AlertActions.
            cta: {
                button: ''
            }
        },
        compoundVariants: [
            {
                variant: 'neutral',
                size: 'wide',
                cta: 'button',
                className: [
                    'rounded-ds-md bg-surface-panel border-border-default',
                    '[&>svg[data-filled]]:fill-current [&>svg[data-filled]]:stroke-none [&>svg[data-filled]]:text-icon-link'
                ]
            }
        ],
        defaultVariants: {
            variant: 'success',
            size: 'wide',
            icon: 'status'
        }
    }
);

type AlertVariantProps = VariantProps<typeof alertVariants>;

type AlertStyleProps = (Omit<AlertVariantProps, 'cta'> & { cta?: never }) | { variant: 'neutral'; size?: 'wide'; cta: 'button'; icon?: never };

/** @deprecated Compose-by-children API. Pass `status` to use the prop-driven `Alert`. */
export type LegacyAlertProps = React.ComponentProps<'div'> &
    AlertStyleProps & {
        status?: never;
        /** Renders the dismiss affordance. Omit for an alert that can't be dismissed. */
        onDismiss?: () => void;
        /** Accessible label for the dismiss button. */
        dismissLabel?: string;
    };

const LegacyAlert = forwardRef<HTMLDivElement, LegacyAlertProps>(
    ({ className, variant, size, cta, icon, onDismiss, dismissLabel = 'Dismiss', children, ...props }, ref) => (
        <div ref={ref} data-slot="alert" role="alert" className={cn(alertVariants({ variant, size, cta, icon }), className)} {...props}>
            <InlineCodeToneProvider value={variant ?? 'success'}>{children}</InlineCodeToneProvider>
            {onDismiss && (
                <button
                    type="button"
                    data-slot="alert-close"
                    aria-label={dismissLabel}
                    onClick={onDismiss}
                    className="cursor-pointer rounded-ds-xs text-[var(--alert-icon)] outline-none focus-visible:shadow-focus-outline-default"
                >
                    <X className="size-4" />
                </button>
            )}
        </div>
    )
);
LegacyAlert.displayName = 'LegacyAlert';

// Figma text/regular/sm (13px/400) in the status colour, truncated to one line.
export const AlertTitle = forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(({ className, ...props }, ref) => (
    <div ref={ref} data-slot="alert-title" className={cn('type-text-regular-sm col-start-2 row-start-1 line-clamp-1 min-h-4', className)} {...props} />
));
AlertTitle.displayName = 'AlertTitle';

// Figma text/regular/xs (12px/400). No explicit row: auto-placement puts it under the title, or on the first row when there is none.
// Descriptions carry dynamic text, so an unbreakable token (a JWT, an id) would otherwise hold the 1fr track at
// its min-content width and push the actions and close button outside the alert. min-w-0 lets the track shrink;
// wrap-anywhere is what actually breaks the token, since overflow-wrap: break-word leaves min-content untouched.
// The title needs neither — its line-clamp brings overflow: hidden, which already zeroes the automatic minimum.
export const AlertDescription = forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        data-slot="alert-description"
        className={cn('type-text-regular-xs col-start-2 inline-flex min-w-0 gap-1 text-wrap wrap-anywhere text-text-default', className)}
        {...props}
    />
));
AlertDescription.displayName = 'AlertDescription';

export const AlertActions = forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(({ className, ...props }, ref) => (
    <div ref={ref} data-slot="alert-actions" className={cn('inline-flex items-center gap-4', className)} {...props} />
));
AlertActions.displayName = 'AlertActions';

/**
 * Figma "AlertButton": borderless, coloured from the parent alert's status via `--alert-link`, so it
 * never has to be told which status it sits in. Inline icons render at 12px — pass one (typically
 * `ExternalLink`) at the call site.
 *
 * Carries the same 2px radius as a regular Button. It renders as inline text with no border or
 * background, so the radius only shows up on the focus ring — 2px keeps that ring consistent with
 * every other focusable control, where the previous pill read as a stray capsule.
 */
export const alertButtonVariants = cva([
    'inline-flex w-fit shrink-0 cursor-pointer items-center justify-center gap-1 whitespace-nowrap',
    'type-text-regular-sm rounded-ds-xs py-0',
    'text-[var(--alert-link)] active:text-[var(--alert-link-active)]',
    'decoration-from-font decoration-solid [text-underline-position:from-font]',
    'hover:underline focus-visible:underline active:underline',
    'transition-colors duration-100 ease-in-out',
    'outline-none focus-visible:shadow-focus-outline-default',
    // pointer-events-none as well as the colour: a disabled <button> still matches :hover, so without it the
    // hover underline would render on a disabled control and imply it's interactive.
    'disabled:pointer-events-none disabled:text-text-disabled aria-disabled:pointer-events-none aria-disabled:text-text-disabled',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3"
]);

export interface AlertButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    asChild?: boolean;
}

export const AlertButton = forwardRef<HTMLButtonElement, AlertButtonProps>(({ className, asChild = false, disabled, onClick, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    return (
        <Comp
            ref={ref}
            type={asChild ? undefined : 'button'}
            data-slot="alert-button"
            className={cn(alertButtonVariants(), className)}
            // `disabled` does nothing on a non-form element, so in asChild mode the state is carried by
            // aria-disabled plus pointer/tab removal — matching how ButtonLink disables an anchor. The
            // handler is swallowed too: pointer-events and tabIndex don't stop a programmatic click, or
            // an Enter press on an anchor something else has focused.
            disabled={asChild ? undefined : disabled}
            aria-disabled={disabled || undefined}
            tabIndex={disabled && asChild ? -1 : undefined}
            onClick={
                disabled
                    ? (event) => {
                          event.preventDefault();
                          event.stopPropagation();
                      }
                    : onClick
            }
            {...props}
        />
    );
});
AlertButton.displayName = 'AlertButton';

export type AlertStatus = 'info' | 'success' | 'warning' | 'danger' | 'neutral';
export type AlertSize = 'wide' | 'compact' | 'toast';

export interface AlertAction {
    label: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    href?: string;
    target?: React.HTMLAttributeAnchorTarget;
    icon?: React.ReactNode;
    disabled?: boolean;
    loading?: boolean;
}

export type StatusAlertProps = Omit<React.ComponentProps<'div'>, 'title'> & {
    status: AlertStatus;
    size?: AlertSize;
    title?: React.ReactNode;
    action?: AlertAction;
    secondaryAction?: AlertAction;
    /** Replaces the status icon; `false` renders none. */
    icon?: React.ReactNode | false;
    dismissible?: boolean;
    onDismiss?: () => void;
    dismissLabel?: string;
    variant?: never;
    cta?: never;
};

export type AlertProps = StatusAlertProps | LegacyAlertProps;

export const statusAlertVariants = cva('relative flex w-full items-start gap-2.5 rounded-ds-md border-ds-hairline px-3 py-2.5', {
    variants: {
        status: {
            info: 'bg-status-info-bg border-status-info-border',
            success: 'bg-status-success-bg border-status-success-border',
            warning: 'bg-status-warning-bg border-status-warning-border',
            danger: 'bg-status-danger-bg border-status-danger-border',
            neutral: 'bg-status-neutral-bg border-border-default'
        }
    }
});

const STATUS_ICON: Record<AlertStatus, React.ReactNode> = {
    info: <Info />,
    success: <CircleCheck />,
    warning: <TriangleAlert />,
    danger: <CircleAlert />,
    neutral: <Info />
};

const STATUS_ICON_COLOR: Record<AlertStatus, string> = {
    info: 'text-status-info-icon',
    success: 'text-status-success-icon',
    warning: 'text-status-warning-icon',
    danger: 'text-status-danger-icon',
    neutral: 'text-status-neutral-icon'
};

const STATUS_LINK_VARIANT = {
    info: 'link-accent',
    success: 'link-success',
    warning: 'link-warning',
    danger: 'link-danger',
    neutral: 'link-neutral'
} as const;

const AlertActionButton = ({ action, status }: { action: AlertAction; status: AlertStatus }) => {
    const variant = STATUS_LINK_VARIANT[status];
    const content = (
        <>
            {action.label}
            {action.icon}
        </>
    );

    if (action.href) {
        return (
            <Button asChild variant={variant} size="sm" disabled={action.disabled}>
                <a href={action.href} target={action.target} rel={action.target === '_blank' ? 'noreferrer' : undefined}>
                    {content}
                </a>
            </Button>
        );
    }
    return (
        <Button variant={variant} size="sm" onClick={action.onClick} disabled={action.disabled} loading={action.loading}>
            {content}
        </Button>
    );
};

const StatusAlert = forwardRef<HTMLDivElement, StatusAlertProps>(
    (
        {
            className,
            status,
            size = 'wide',
            title,
            action,
            secondaryAction,
            icon,
            dismissible = false,
            onDismiss,
            dismissLabel = 'Dismiss',
            children,
            role = 'alert',
            ...props
        },
        ref
    ) => {
        const [dismissed, setDismissed] = useState(false);
        if (dismissed) {
            return null;
        }

        const hasActions = Boolean(action || secondaryAction);
        // Each wrapper is one 13px line box tall, so the icon, actions and close sit on the first line of text.
        const actions = hasActions && (
            <div data-slot="alert-actions" className={cn('flex min-h-5 shrink-0 items-center gap-3', size !== 'wide' && 'pt-1')}>
                {action && <AlertActionButton action={action} status={status} />}
                {secondaryAction && <AlertActionButton action={secondaryAction} status={status} />}
            </div>
        );
        const iconNode = icon === undefined ? STATUS_ICON[status] : icon;

        return (
            <div
                ref={ref}
                data-slot="alert"
                data-status={status}
                data-size={size}
                role={role}
                className={cn(statusAlertVariants({ status }), className)}
                {...props}
            >
                {iconNode !== false && iconNode !== null && (
                    <span data-slot="alert-icon" className={cn('mt-0.5 flex shrink-0 [&>svg]:size-4', STATUS_ICON_COLOR[status])}>
                        {iconNode}
                    </span>
                )}
                <InlineCodeToneProvider value={status}>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        {title && (
                            <div data-slot="alert-title" className="type-text-medium-sm text-text-strong">
                                {title}
                            </div>
                        )}
                        {children && (
                            <div data-slot="alert-description" className="type-text-regular-sm text-text-default wrap-anywhere">
                                {children}
                            </div>
                        )}
                        {size !== 'wide' && actions}
                    </div>
                </InlineCodeToneProvider>
                {size === 'wide' && actions}
                {dismissible && (
                    <button
                        type="button"
                        data-slot="alert-close"
                        aria-label={dismissLabel}
                        onClick={() => {
                            setDismissed(true);
                            onDismiss?.();
                        }}
                        className={cn(
                            'mt-0.5 shrink-0 cursor-pointer rounded-ds-xs outline-none focus-visible:shadow-focus-outline-default',
                            STATUS_ICON_COLOR[status]
                        )}
                    >
                        <X className="size-4" />
                    </button>
                )}
            </div>
        );
    }
);
StatusAlert.displayName = 'StatusAlert';

// Without `status`, falls back to the deprecated compose-by-children API until its call sites migrate.
export const Alert = forwardRef<HTMLDivElement, AlertProps>((props, ref) =>
    props.status ? <StatusAlert ref={ref} {...props} /> : <LegacyAlert ref={ref} {...(props as LegacyAlertProps)} />
);
Alert.displayName = 'Alert';
