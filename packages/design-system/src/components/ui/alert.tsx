import { cva } from 'class-variance-authority';
import { X } from 'lucide-react';
import { createContext, forwardRef, useContext } from 'react';

import { cn } from '../../lib/cn';
import { LinkButton } from './link-button';

import type { LinkButtonProps } from './link-button';
import type { VariantProps } from 'class-variance-authority';

/**
 * Children are placed by column/row rather than wrapped, so call sites keep passing the icon,
 * `AlertTitle`, `AlertDescription` and `AlertActions` as flat siblings. Horizontal spacing lives on
 * the children (not `gap-x`) so that empty `auto` tracks collapse instead of leaving a gap behind.
 */
// Shared by the cva default and the status context so an Alert without `variant` styles and tones its actions alike.
const DEFAULT_ALERT_VARIANT = 'success';

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
                info: ['bg-status-info-bg border-status-info-border text-status-info-text', '[--alert-icon:var(--color-status-info-icon)]'],
                success: ['bg-status-success-bg border-status-success-border text-status-success-text', '[--alert-icon:var(--color-status-success-icon)]'],
                warning: ['bg-status-warning-bg border-status-warning-border text-status-warning-text', '[--alert-icon:var(--color-status-warning-icon)]'],
                danger: ['bg-status-danger-bg border-status-danger-border text-status-danger-text', '[--alert-icon:var(--color-status-danger-icon)]'],
                neutral: ['bg-status-neutral-bg border-status-neutral-border text-status-neutral-text', '[--alert-icon:var(--color-status-neutral-icon)]']
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
            variant: DEFAULT_ALERT_VARIANT,
            size: 'wide',
            icon: 'status'
        }
    }
);

type AlertVariantProps = VariantProps<typeof alertVariants>;

type AlertStatus = NonNullable<AlertVariantProps['variant']>;

// The parent alert's status, so AlertButton can pick the matching LinkButton tone without being told.
// Outside an Alert it falls back to neutral.
const AlertStatusContext = createContext<AlertStatus>('neutral');

type AlertStyleProps = (Omit<AlertVariantProps, 'cta'> & { cta?: never }) | { variant: 'neutral'; size?: 'wide'; cta: 'button'; icon?: never };

export type AlertProps = React.ComponentProps<'div'> &
    AlertStyleProps & {
        /** Renders the dismiss affordance. Omit for an alert that can't be dismissed. */
        onDismiss?: () => void;
        /** Accessible label for the dismiss button. */
        dismissLabel?: string;
    };

export const Alert = forwardRef<HTMLDivElement, AlertProps>(
    ({ className, variant, size, cta, icon, onDismiss, dismissLabel = 'Dismiss', children, ...props }, ref) => (
        <div ref={ref} data-slot="alert" role="alert" className={cn(alertVariants({ variant, size, cta, icon }), className)} {...props}>
            <AlertStatusContext.Provider value={variant ?? DEFAULT_ALERT_VARIANT}>{children}</AlertStatusContext.Provider>
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
Alert.displayName = 'Alert';

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
 * Figma "AlertButton": a LinkButton whose tone follows the parent alert's status, so it never has to be told
 * which status it sits in and picks up every LinkButton change. Info alerts use the accent tone (text/link,
 * the colour alert links have always had); the other statuses use the tone of the same name.
 * Renders at LinkButton `md` (13px label, 14px icons); pass icons as children or via `leftIcon`/`rightIcon`.
 */
export type AlertButtonProps = Omit<LinkButtonProps, 'tone'>;

const TONE_FOR_STATUS = {
    info: 'accent',
    success: 'success',
    warning: 'warning',
    danger: 'danger',
    neutral: 'neutral'
} as const satisfies Record<AlertStatus, NonNullable<LinkButtonProps['tone']>>;

export const AlertButton = forwardRef<HTMLButtonElement, AlertButtonProps>(({ size = 'md', ...props }, ref) => {
    const status = useContext(AlertStatusContext);
    return <LinkButton ref={ref} data-slot="alert-button" tone={TONE_FOR_STATUS[status]} size={size} {...props} />;
});
AlertButton.displayName = 'AlertButton';
