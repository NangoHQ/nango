import * as LabelPrimitive from '@radix-ui/react-label';
import { cva } from 'class-variance-authority';
import { CircleAlert } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/cn';
import { FieldContext, useFieldContext } from './field-context';

import type { FieldContextValue } from './field-context';
import type { VariantProps } from 'class-variance-authority';

export const fieldVariants = cva('group/field w-full', {
    variants: {
        orientation: {
            // Label, control, description and error stacked, 6px apart (Figma Field 2587:367, space/1.5).
            vertical: 'flex flex-col gap-1.5',
            // Settings row: a 220px label column (label + description) beside the control, 32px apart (space/8).
            // The label column spans both rows so the error lands under the control, not under the label.
            horizontal: [
                'grid grid-cols-[220px_minmax(0,1fr)] grid-rows-[auto_1fr] items-start gap-x-8 gap-y-1.5',
                '[&>:first-child]:row-span-2 [&>:first-child]:pt-1.5',
                '[&>:not(:first-child)]:col-start-2'
            ],
            // Label beside a small control (switch, checkbox), control first, 8px apart (Figma 2596:38). This was
            // `horizontal` before the Dharma settings-row layout took that name. The control centres on the label's
            // first line (row height 20 on md, 18 on sm), so a wrapping label or a description hangs below it.
            inline: [
                'flex flex-row items-start gap-2',
                '[&>[data-slot=checkbox]]:mt-0.5 [&>[data-slot=switch]]:mt-px',
                // The whole row is clickable (see Field's onClick)
                'has-[>[data-slot=checkbox]:enabled]:cursor-pointer has-[>[data-slot=switch]:enabled]:cursor-pointer'
            ]
        }
    },
    defaultVariants: {
        orientation: 'vertical'
    }
});

export interface FieldProps extends React.ComponentProps<'div'>, VariantProps<typeof fieldVariants> {
    /** Drives the control's Error state and wires `aria-invalid` on the control. */
    'data-invalid'?: boolean | 'true' | 'false' | undefined;
    'data-disabled'?: boolean | 'true' | 'false' | undefined;
}

/**
 * Composition container for a label + control + description + error (Figma "Field").
 *
 * Field generates the ids: FieldLabel gets `htmlFor`, the first Input / InputGroupInput inside gets `id`,
 * `aria-describedby` (description + error) and `aria-invalid` (from `data-invalid`). Explicit props always win.
 */
const ROW_CONTROL_SELECTOR = ':scope > [data-slot=checkbox], :scope > [data-slot=switch]';
const INTERACTIVE_SELECTOR = 'a, button, input, label, select, textarea, [role=checkbox], [role=switch]';

function Field({ className, orientation, children, onClick, ...props }: FieldProps) {
    const baseId = React.useId();
    const [renderedDescriptionId, registerDescription] = React.useState<string | null>(null);
    const [renderedErrorId, registerError] = React.useState<string | null>(null);
    const claimedBy = React.useRef<string | null>(null);
    const invalid = props['data-invalid'] === true || props['data-invalid'] === 'true';
    const disabled = props['data-disabled'] === true || props['data-disabled'] === 'true';

    const value = React.useMemo<FieldContextValue>(
        () => ({
            controlId: `${baseId}-control`,
            descriptionId: `${baseId}-description`,
            errorId: `${baseId}-error`,
            invalid,
            disabled,
            registerDescription,
            registerError,
            claimControl: (key) => {
                claimedBy.current ??= key;
                return claimedBy.current === key;
            },
            renderedDescriptionId,
            renderedErrorId
        }),
        [baseId, invalid, disabled, renderedDescriptionId, renderedErrorId]
    );

    // Inline rows: a click anywhere in the row (description, gap) toggles the checkbox/switch. The label already
    // does via htmlFor, and clicks on the control or other interactive children are left alone.
    const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
        onClick?.(event);
        if (orientation !== 'inline' || event.defaultPrevented) {
            return;
        }
        if (event.target instanceof Element && event.target.closest(INTERACTIVE_SELECTOR)) {
            return;
        }
        event.currentTarget.querySelector<HTMLElement>(ROW_CONTROL_SELECTOR)?.click();
    };

    return (
        <FieldContext.Provider value={value}>
            <div
                role="group"
                data-slot="field"
                data-orientation={orientation ?? 'vertical'}
                className={cn(fieldVariants({ orientation }), className)}
                onClick={handleClick}
                {...props}
            >
                {children}
            </div>
        </FieldContext.Provider>
    );
}

/** Groups a label with its description, e.g. the label column of a horizontal Field. */
function FieldContent({ className, ...props }: React.ComponentProps<'div'>) {
    return <div data-slot="field-content" className={cn('flex min-w-0 flex-col gap-0.5', className)} {...props} />;
}

/** Lays sibling Fields out in a row, sharing width evenly (Figma "Field Group"). */
function FieldGroup({ className, ...props }: React.ComponentProps<'div'>) {
    return <div data-slot="field-group" className={cn('flex w-full items-start gap-4 [&>*]:min-w-0 [&>[data-slot=field]]:flex-1', className)} {...props} />;
}

/** Semantic grouping of related fields under a legend (Figma "FieldSet"). */
function FieldSet({ className, ...props }: React.ComponentProps<'fieldset'>) {
    return <fieldset data-slot="field-set" className={cn('flex w-full min-w-0 flex-col gap-5', className)} {...props} />;
}

export interface FieldLegendProps extends Omit<React.ComponentProps<'legend'>, 'title'> {
    /** `legend` (section heading, default) or the smaller `label` used for nested groups. */
    variant?: 'legend' | 'label';
    /** Optional secondary line below the title (Figma legend description). */
    description?: React.ReactNode;
}

/** Title and optional description for a FieldSet (Figma "Field / Legend"). */
function FieldLegend({ className, variant = 'legend', description, children, ...props }: FieldLegendProps) {
    return (
        <legend data-slot="field-legend" data-variant={variant} className={cn('flex w-full flex-col gap-0.5', className)} {...props}>
            <span
                className={cn(
                    'text-text-strong font-ds-medium',
                    // Figma heading/sm for the section legend; text/medium/md for the smaller label variant
                    variant === 'legend' ? 'text-ds-lg leading-ds-snug tracking-ds-tight' : 'text-ds-md leading-ds-normal'
                )}
            >
                {children}
            </span>
            {description != null && <span className="text-text-secondary text-ds-xs font-ds-regular leading-ds-normal">{description}</span>}
        </legend>
    );
}

export interface FieldLabelProps extends React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> {
    /** Appends a muted "Optional" tag. Required fields aren't marked — mark the optional ones instead. */
    optional?: boolean;
}

/** The design system's label (Figma "FieldLabel"). Wraps the radix label; there is no standalone Label component. */
const FieldLabel = React.forwardRef<React.ElementRef<typeof LabelPrimitive.Root>, FieldLabelProps>(
    ({ className, optional, htmlFor, children, ...props }, ref) => {
        const field = useFieldContext();
        return (
            <LabelPrimitive.Root
                ref={ref}
                data-slot="field-label"
                htmlFor={htmlFor ?? field?.controlId}
                className={cn(
                    // Layout — inline so the label can sit beside an icon, tooltip, or the optional tag
                    'flex min-w-0 flex-wrap items-baseline gap-1.5 wrap-break-word select-none',
                    // Typography (Figma label/md: Geist Medium 13, text/default)
                    'font-sans text-ds-sm font-ds-medium leading-ds-snug tracking-ds-tight text-text-default',
                    // Disabled affordances driven by an ancestor Field[data-disabled] or a peer :disabled control
                    'group-data-[disabled=true]/field:text-text-disabled group-data-[disabled=true]/field:pointer-events-none peer-disabled:cursor-not-allowed',
                    // Beside a checkbox/switch (Figma text/regular/sm, 12px with an sm control; text/disabled when it's disabled)
                    'group-data-[orientation=inline]/field:font-ds-regular group-data-[orientation=inline]/field:leading-ds-normal group-data-[orientation=inline]/field:tracking-ds-normal',
                    'group-has-[>[data-slot=checkbox][data-size=sm]]/field:text-ds-xs group-has-[>[data-slot=switch][data-size=sm]]/field:text-ds-xs',
                    'group-has-[>[data-slot=checkbox]:enabled]/field:cursor-pointer group-has-[>[data-slot=switch]:enabled]/field:cursor-pointer',
                    'group-has-[>[data-slot=checkbox]:disabled]/field:text-text-disabled group-has-[>[data-slot=switch]:disabled]/field:text-text-disabled',
                    className
                )}
                {...props}
            >
                {children}
                {optional && <span className="font-sans text-ds-xs font-ds-regular leading-ds-normal text-text-muted">Optional</span>}
            </LabelPrimitive.Root>
        );
    }
);
FieldLabel.displayName = 'FieldLabel';

function FieldDescription({ className, id, ...props }: React.ComponentProps<'p'>) {
    const field = useFieldContext();
    const resolvedId = id ?? field?.descriptionId;
    const register = field?.registerDescription;
    React.useLayoutEffect(() => {
        if (!register || !resolvedId) {
            return;
        }
        register(resolvedId);
        return () => register(null);
    }, [register, resolvedId]);

    return (
        <p
            data-slot="field-description"
            id={resolvedId}
            // Figma text/regular/xs + text/secondary
            className={cn('font-sans text-ds-xs font-ds-regular leading-ds-normal text-text-secondary', className)}
            {...props}
        />
    );
}

export interface FieldErrorProps extends React.ComponentProps<'div'> {
    /** react-hook-form-style errors; deduped and rendered when no children are passed. */
    errors?: (({ message?: string } | undefined) | null)[];
}

/** Danger validation message with a CircleAlert icon. Renders nothing when empty (matches the old FormMessage). */
function FieldError({ className, children, errors, id, ...props }: FieldErrorProps) {
    const field = useFieldContext();
    let body: React.ReactNode = children;
    if ((body === undefined || body === null) && errors?.length) {
        const messages = Array.from(new Set(errors.map((error) => error?.message).filter((message): message is string => Boolean(message))));
        if (messages.length === 1) {
            body = messages[0];
        } else if (messages.length > 1) {
            body = (
                <ul className="ml-4 list-disc">
                    {messages.map((message) => (
                        <li key={message}>{message}</li>
                    ))}
                </ul>
            );
        }
    }

    const isEmpty = body === undefined || body === null || body === '';
    const resolvedId = id ?? field?.errorId;
    const register = field?.registerError;
    React.useLayoutEffect(() => {
        if (!register || !resolvedId || isEmpty) {
            return;
        }
        register(resolvedId);
        return () => register(null);
    }, [register, resolvedId, isEmpty]);

    if (isEmpty) {
        return null;
    }

    return (
        <div
            role="alert"
            id={resolvedId}
            data-slot="field-error"
            // Figma: CircleAlert 12px icon/danger + text/regular/xs text/danger
            className={cn('font-sans text-ds-xs font-ds-regular leading-ds-normal text-text-danger flex items-start gap-1', className)}
            {...props}
        >
            {/* Centred on the first 18px line (12px × 1.5) */}
            <CircleAlert aria-hidden className="text-icon-danger mt-0.75 size-3 shrink-0" />
            <div className="min-w-0">{body}</div>
        </div>
    );
}

/** Horizontal rule, optionally with centered text (Figma "Field / Separator"). */
function FieldSeparator({ className, children, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            role="separator"
            data-slot="field-separator"
            data-content={children != null ? true : undefined}
            className={cn('flex items-center gap-2', className)}
            {...props}
        >
            <span aria-hidden className="h-0 flex-1 border-t-[0.5px] border-border-strong" />
            {children != null && (
                <>
                    <span data-slot="field-separator-content" className="text-text-secondary text-ds-md font-ds-regular leading-ds-normal shrink-0">
                        {children}
                    </span>
                    <span aria-hidden className="h-0 flex-1 border-t-[0.5px] border-border-strong" />
                </>
            )}
        </div>
    );
}

export { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSeparator, FieldSet };
