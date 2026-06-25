import { cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/cn';
import { Label } from './label';

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

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
    // Turns danger on invalid (Figma): either an ancestor Field carries data-invalid, or the label itself carries data-error.
    return (
        <Label
            data-slot="field-label"
            className={cn('group-data-[invalid=true]/field:text-text-danger data-[error=true]:text-text-danger', className)}
            {...props}
        />
    );
}

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

export { Field, FieldDescription, FieldError, FieldGroup, FieldLabel };
