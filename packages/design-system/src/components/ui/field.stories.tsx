import { Controller, useForm } from 'react-hook-form';

import { Button } from './button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from './field';
import { Input } from './input';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Design System/Components/Field',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

// Focus is an interaction state — inspect it live in the canvas; it can't be forced statically.
export const States: Story = {
    render: () => (
        <div className="flex flex-col gap-6 w-80">
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Label + input</span>
                <Field>
                    <FieldLabel htmlFor="field-name">Name</FieldLabel>
                    <Input id="field-name" placeholder="Acme Inc." />
                </Field>
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">With description</span>
                <Field>
                    <FieldLabel htmlFor="field-email">Email</FieldLabel>
                    <Input id="field-email" type="email" placeholder="you@example.com" />
                    <FieldDescription>We'll never share your email with anyone.</FieldDescription>
                </Field>
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Required</span>
                <Field>
                    <FieldLabel htmlFor="field-required">
                        Required field <span className="text-text-danger">*</span>
                    </FieldLabel>
                    <Input id="field-required" placeholder="Can't be empty" />
                </Field>
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Invalid (with error)</span>
                <Field data-invalid="true">
                    <FieldLabel htmlFor="field-invalid">Username</FieldLabel>
                    <Input id="field-invalid" defaultValue="bad value" aria-invalid />
                    <FieldError errors={[{ message: 'This field is required.' }]} />
                </Field>
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Disabled</span>
                <Field>
                    <FieldLabel htmlFor="field-disabled">Disabled</FieldLabel>
                    <Input id="field-disabled" placeholder="Disabled" disabled />
                </Field>
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Field group</span>
                <FieldGroup>
                    <Field>
                        <FieldLabel htmlFor="field-first">First name</FieldLabel>
                        <Input id="field-first" placeholder="Jordan" />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="field-last">Last name</FieldLabel>
                        <Input id="field-last" placeholder="Lee" />
                    </Field>
                </FieldGroup>
            </div>
        </div>
    )
};

// The shadcn-recommended composition: react-hook-form's Controller drives the dependency-free Field family.
export const WithReactHookForm: Story = {
    render: function WithReactHookFormRender() {
        const form = useForm({ defaultValues: { email: '' }, mode: 'onTouched' });
        return (
            <form onSubmit={form.handleSubmit(() => {})} className="flex w-80 flex-col gap-4" noValidate>
                <Controller
                    control={form.control}
                    name="email"
                    rules={{ required: 'Email is required.', pattern: { value: /.+@.+/, message: 'Enter a valid email address.' } }}
                    render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                            <Input id={field.name} type="email" placeholder="you@example.com" aria-invalid={fieldState.invalid} {...field} />
                            <FieldDescription>We'll never share your email with anyone.</FieldDescription>
                            <FieldError errors={[fieldState.error]} />
                        </Field>
                    )}
                />
                <Button type="submit" size="md">
                    Save
                </Button>
            </form>
        );
    }
};
