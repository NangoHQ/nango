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
            vertical: 'flex flex-col gap-1.5',
            // The label column spans both rows so the error lands under the control
            horizontal: [
                'grid grid-cols-[220px_minmax(0,1fr)] grid-rows-[auto_1fr] items-start gap-x-8 gap-y-1.5',
                '[&>:first-child]:row-span-2 [&>:first-child]:pt-1.5',
                '[&>:not(:first-child)]:col-start-2'
            ],
            inline: ['flex flex-row items-start gap-2', '[&>[data-slot=checkbox]]:mt-0.5 [&>[data-slot=switch]]:mt-px']
        }
    },
    defaultVariants: {
        orientation: 'vertical'
    }
});

export interface FieldProps extends React.ComponentProps<'div'>, VariantProps<typeof fieldVariants> {
    'data-invalid'?: boolean | 'true' | 'false' | undefined;
    'data-disabled'?: boolean | 'true' | 'false' | undefined;
}

function Field({ className, orientation, children, ...props }: FieldProps) {
    const baseId = React.useId();
    const [renderedDescriptionId, registerDescription] = React.useState<string | null>(null);
    const [renderedErrorId, registerError] = React.useState<string | null>(null);
    const [controls, setControls] = React.useState<{ key: string; id: string | undefined }[]>([]);
    const invalid = props['data-invalid'] === true || props['data-invalid'] === 'true';
    const disabled = props['data-disabled'] === true || props['data-disabled'] === 'true';

    const registerControl = React.useCallback((key: string) => {
        setControls((prev) => [...prev, { key, id: undefined }]);
        return () => setControls((prev) => prev.filter((control) => control.key !== key));
    }, []);
    const setControlId = React.useCallback((key: string, id: string | undefined) => {
        setControls((prev) =>
            prev.some((control) => control.key === key && control.id !== id) ? prev.map((control) => (control.key === key ? { key, id } : control)) : prev
        );
    }, []);
    const primary = controls[0];
    const controlId = `${baseId}-control`;

    const value = React.useMemo<FieldContextValue>(
        () => ({
            controlId,
            descriptionId: `${baseId}-description`,
            errorId: `${baseId}-error`,
            invalid,
            disabled,
            registerDescription,
            registerError,
            registerControl,
            setControlId,
            primaryControlKey: primary?.key ?? null,
            labelTarget: primary ? (primary.id ?? controlId) : undefined,
            renderedDescriptionId,
            renderedErrorId
        }),
        [controlId, invalid, disabled, registerControl, setControlId, primary?.key, primary?.id, renderedDescriptionId, renderedErrorId]
    );

    return (
        <FieldContext.Provider value={value}>
            <div
                role="group"
                data-slot="field"
                data-orientation={orientation ?? 'vertical'}
                className={cn(fieldVariants({ orientation }), className)}
                {...props}
            >
                {children}
            </div>
        </FieldContext.Provider>
    );
}

/** In a horizontal Field, wrap the label and description in this: only the first child fills the label column. */
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
                htmlFor={htmlFor ?? field?.labelTarget}
                className={cn(
                    'flex min-w-0 flex-wrap items-baseline gap-1.5 wrap-break-word select-none',
                    'font-sans text-ds-sm font-ds-medium leading-ds-snug tracking-ds-tight text-text-default',
                    'group-data-[disabled=true]/field:text-text-disabled group-data-[disabled=true]/field:pointer-events-none peer-disabled:cursor-not-allowed',
                    'group-data-[orientation=inline]/field:font-ds-regular group-data-[orientation=inline]/field:leading-ds-normal group-data-[orientation=inline]/field:tracking-ds-normal',
                    'group-has-[>[data-slot=checkbox][data-size=sm]]/field:text-ds-xs group-has-[>[data-slot=switch][data-size=sm]]/field:text-ds-xs',
                    'group-has-[>[data-slot=checkbox]:enabled]/field:cursor-pointer group-has-[>[data-slot=switch]:enabled]/field:cursor-pointer',
                    'group-has-[>[data-slot=checkbox]:disabled]/field:text-text-disabled group-has-[>[data-slot=switch]:disabled]/field:text-text-disabled',
                    className
                )}
                {...props}
            >
                {children}
                {optional && <span className="font-sans text-ds-xs font-ds-regular leading-ds-normal tracking-ds-normal text-text-muted">Optional</span>}
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
            className={cn('font-sans text-ds-xs font-ds-regular leading-ds-normal text-text-secondary', className)}
            {...props}
        />
    );
}

export interface FieldErrorProps extends React.ComponentProps<'div'> {
    /** react-hook-form-style errors; deduped and rendered when no children are passed. */
    errors?: (({ message?: string } | undefined) | null)[];
}

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
