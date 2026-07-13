import * as LabelPrimitive from '@radix-ui/react-label';
import { cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/cn';

import type { VariantProps } from 'class-variance-authority';

export const fieldVariants = cva('group/field flex w-full gap-2', {
    variants: {
        orientation: {
            // Label, control, description and error stacked (Figma "Field", space/2 gap)
            vertical: 'flex-col',
            // Label beside the control — e.g. a switch or checkbox row
            horizontal: 'flex-row items-center'
        }
    },
    defaultVariants: {
        orientation: 'vertical'
    }
});

export interface FieldProps extends React.ComponentProps<'div'>, VariantProps<typeof fieldVariants> {}

/**
 * Composition container for a label + control + description + error (Figma "Field").
 * Set `data-invalid` to surface the invalid state to descendants (e.g. FieldLabel turns danger).
 */
function Field({ className, orientation, ...props }: FieldProps) {
    return <div role="group" data-slot="field" className={cn(fieldVariants({ orientation }), className)} {...props} />;
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

export type FieldLabelProps = React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>;

/** The design system's label (Figma "FieldLabel"). Wraps the radix label; there is no standalone Label component. */
const FieldLabel = React.forwardRef<React.ElementRef<typeof LabelPrimitive.Root>, FieldLabelProps>(({ className, ...props }, ref) => (
    <LabelPrimitive.Root
        ref={ref}
        data-slot="field-label"
        className={cn(
            // Layout — inline so the label can sit beside an icon, tooltip, or required asterisk (Figma space/2 gap)
            'flex items-center gap-2 select-none',
            // Typography (Figma text/medium/md)
            'text-text-strong text-ds-md font-ds-medium leading-ds-normal',
            // Disabled affordances driven by an ancestor [data-disabled] or a peer :disabled control
            'group-data-[disabled=true]:pointer-events-none peer-disabled:cursor-not-allowed',
            // Turns danger on invalid (Figma): an ancestor Field carries data-invalid, or the label itself carries data-error
            'group-data-[invalid=true]/field:text-text-danger data-[error=true]:text-text-danger',
            className
        )}
        {...props}
    />
));
FieldLabel.displayName = 'FieldLabel';

function FieldDescription({ className, ...props }: React.ComponentProps<'p'>) {
    return (
        <p
            data-slot="field-description"
            // Figma text/secondary + text/regular/xs
            className={cn('text-text-secondary text-ds-xs font-ds-regular leading-ds-normal', className)}
            {...props}
        />
    );
}

export interface FieldErrorProps extends React.ComponentProps<'div'> {
    /** react-hook-form-style errors; deduped and rendered when no children are passed. */
    errors?: (({ message?: string } | undefined) | null)[];
}

/** Danger-colored validation message. Renders nothing when empty (matches the old FormMessage). */
function FieldError({ className, children, errors, ...props }: FieldErrorProps) {
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

    if (body === undefined || body === null || body === '') {
        return null;
    }

    return (
        <div role="alert" data-slot="field-error" className={cn('text-text-danger text-ds-xs font-ds-regular', className)} {...props}>
            {body}
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
            <span aria-hidden className="h-0 flex-1 border-t-ds-hairline border-border-strong" />
            {children != null && (
                <>
                    <span data-slot="field-separator-content" className="text-text-secondary text-ds-md font-ds-regular leading-ds-normal shrink-0">
                        {children}
                    </span>
                    <span aria-hidden className="h-0 flex-1 border-t-ds-hairline border-border-strong" />
                </>
            )}
        </div>
    );
}

export { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSeparator, FieldSet };
