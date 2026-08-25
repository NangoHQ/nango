'use client';

import { Slot } from '@radix-ui/react-slot';
import * as React from 'react';
import { Controller, FormProvider, useFormContext, useFormState } from 'react-hook-form';

import { Field, FieldDescription, FieldError, FieldLabel } from '@nangohq/design-system';

import type { ControllerProps, FieldPath, FieldValues } from 'react-hook-form';

// Thin react-hook-form adapter over the design-system Field family. The DS owns all presentation
// and tokens; this file only wires RHF state (errors, ids, aria) into Field/FieldLabel/FieldError.

const Form = FormProvider;

interface FormFieldContextValue<TFieldValues extends FieldValues = FieldValues, TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>> {
    name: TName;
}

const FormFieldContext = React.createContext<FormFieldContextValue>({} as FormFieldContextValue);

const FormField = <TFieldValues extends FieldValues = FieldValues, TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>>({
    ...props
}: ControllerProps<TFieldValues, TName>) => {
    return (
        <FormFieldContext.Provider value={{ name: props.name }}>
            <Controller {...props} />
        </FormFieldContext.Provider>
    );
};

const useFormField = () => {
    const fieldContext = React.useContext(FormFieldContext);
    const itemContext = React.useContext(FormItemContext);
    const { getFieldState } = useFormContext();
    const formState = useFormState({ name: fieldContext.name });
    const fieldState = getFieldState(fieldContext.name, formState);

    if (!fieldContext) {
        throw new Error('useFormField should be used within <FormField>');
    }

    const { id } = itemContext;

    return {
        id,
        name: fieldContext.name,
        formItemId: `${id}-form-item`,
        formDescriptionId: `${id}-form-item-description`,
        formMessageId: `${id}-form-item-message`,
        ...fieldState
    };
};

interface FormItemContextValue {
    id: string;
}

const FormItemContext = React.createContext<FormItemContextValue>({} as FormItemContextValue);

function FormItem({ ...props }: React.ComponentProps<typeof Field>) {
    const id = React.useId();

    return (
        <FormItemContext.Provider value={{ id }}>
            <Field data-slot="form-item" {...props} />
        </FormItemContext.Provider>
    );
}

function FormLabel({ ...props }: React.ComponentProps<typeof FieldLabel>) {
    const { error, formItemId } = useFormField();

    return <FieldLabel data-slot="form-label" data-error={!!error} htmlFor={formItemId} {...props} />;
}

function FormControl({ ...props }: React.ComponentProps<typeof Slot>) {
    const { error, formItemId, formDescriptionId, formMessageId } = useFormField();

    return (
        <Slot
            data-slot="form-control"
            id={formItemId}
            aria-describedby={!error ? formDescriptionId : `${formDescriptionId} ${formMessageId}`}
            aria-invalid={!!error}
            {...props}
        />
    );
}

function FormDescription({ ...props }: React.ComponentProps<typeof FieldDescription>) {
    const { formDescriptionId } = useFormField();

    return <FieldDescription data-slot="form-description" id={formDescriptionId} {...props} />;
}

function FormMessage({ children, ...props }: React.ComponentProps<typeof FieldError>) {
    const { error, formMessageId } = useFormField();
    const body = error ? String(error?.message ?? '') : children;

    if (!body) {
        return null;
    }

    return (
        <FieldError data-slot="form-message" id={formMessageId} {...props}>
            {body}
        </FieldError>
    );
}

export { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, useFormField };
