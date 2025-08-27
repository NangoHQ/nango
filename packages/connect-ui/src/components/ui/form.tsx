import { Slot } from '@radix-ui/react-slot';
import { IconExclamationCircle } from '@tabler/icons-react';
import * as React from 'react';
import { Controller, FormProvider, useFormContext } from 'react-hook-form';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import type * as LabelPrimitive from '@radix-ui/react-label';
import type { ControllerProps, FieldPath, FieldValues } from 'react-hook-form';

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
    const { getFieldState, formState } = useFormContext();

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

const FormItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => {
    const id = React.useId();

    return (
        <FormItemContext.Provider value={{ id }}>
            <div ref={ref} className={cn('space-y-3.5', className)} {...props} />
        </FormItemContext.Provider>
    );
});
FormItem.displayName = 'FormItem';

const FormLabel = React.forwardRef<React.ElementRef<typeof LabelPrimitive.Root>, React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>>(
    ({ className, ...props }, ref) => {
        const { formItemId } = useFormField();

        return <Label ref={ref} className={cn(className)} htmlFor={formItemId} {...props} />;
    }
);
FormLabel.displayName = 'FormLabel';

const FormControl = React.forwardRef<React.ElementRef<typeof Slot>, React.ComponentPropsWithoutRef<typeof Slot>>(({ ...props }, ref) => {
    const { error, formItemId, formDescriptionId, formMessageId } = useFormField();

    return (
        <Slot
            ref={ref}
            aria-describedby={!error ? formDescriptionId : `${formDescriptionId} ${formMessageId}`}
            aria-invalid={!!error}
            id={formItemId}
            {...props}
        />
    );
});
FormControl.displayName = 'FormControl';

const FormDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({ className, ...props }, ref) => {
    const { formDescriptionId } = useFormField();

    return <p ref={ref} className={cn('text-sm text-text-muted', className)} id={formDescriptionId} {...props} />;
});
FormDescription.displayName = 'FormDescription';

const FormMessage = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({ className, children, ...props }, ref) => {
    const { error, formMessageId } = useFormField();
    const body = error ? String(error?.message) : children;

    if (!body) {
        return null;
    }

    return (
        <p ref={ref} className={cn('text-sm text-red-base dark:text-red-base flex gap-2 items-center pt-2', className)} id={formMessageId} {...props}>
            <IconExclamationCircle size={17} /> {body}
        </p>
    );
});
FormMessage.displayName = 'FormMessage';

export { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, useFormField };
