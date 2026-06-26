import { Controller, useForm } from 'react-hook-form';

import { Button } from './button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSeparator, FieldSet } from './field';
import { Input } from './input';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Design System/Components/Field',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

// A Field wraps a label + control + optional description + error. Focus is an interaction state —
// inspect it live in the canvas; it can't be forced statically.
export const States: Story = {
    render: () => (
        <div className="flex w-80 flex-col gap-6">
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
        </div>
    )
};

// FieldGroup lays sibling Fields out in a row, sharing width evenly.
export const Group: Story = {
    render: () => (
        <FieldGroup className="w-96">
            <Field>
                <FieldLabel htmlFor="group-first">First name</FieldLabel>
                <Input id="group-first" placeholder="Jordan" />
            </Field>
            <Field>
                <FieldLabel htmlFor="group-last">Last name</FieldLabel>
                <Input id="group-last" placeholder="Lee" />
            </Field>
        </FieldGroup>
    )
};

// FieldLegend titles a FieldSet — the larger `legend` for a section, the smaller `label` for nested sub-groups.
export const Legend: Story = {
    render: () => (
        <div className="flex w-96 flex-col gap-6">
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Legend variant</span>
                <FieldSet>
                    <FieldLegend description="A short supporting line for the section.">Payment method</FieldLegend>
                </FieldSet>
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Label variant</span>
                <FieldSet>
                    <FieldLegend variant="label" description="Smaller heading for nested sub-groups.">
                        Billing address
                    </FieldLegend>
                </FieldSet>
            </div>
        </div>
    )
};

// FieldSeparator: a horizontal rule, optionally with centered text.
export const Separator: Story = {
    render: () => (
        <div className="flex w-80 flex-col gap-6">
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Plain rule</span>
                <FieldSeparator />
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">With text</span>
                <FieldSeparator>or continue with</FieldSeparator>
            </div>
        </div>
    )
};

// A FieldSet groups related fields under a legend; FieldSeparator divides sub-sections (Figma playground).
export const FieldSetComposition: Story = {
    name: 'Field Set',
    render: () => (
        <FieldSet className="w-96">
            <FieldLegend description="Lorem ipsum dolor sit amet, consectetur adipiscing elit.">Payment method</FieldLegend>
            <Field>
                <FieldLabel htmlFor="set-name">Name on card</FieldLabel>
                <Input id="set-name" placeholder="Jordan Lee" />
            </Field>
            <Field>
                <FieldLabel htmlFor="set-number">Card number</FieldLabel>
                <Input id="set-number" placeholder="1234 5678 9012 3456" />
            </Field>
            <FieldGroup>
                <Field>
                    <FieldLabel htmlFor="set-month">Month</FieldLabel>
                    <Input id="set-month" placeholder="MM" />
                </Field>
                <Field>
                    <FieldLabel htmlFor="set-year">Year</FieldLabel>
                    <Input id="set-year" placeholder="YY" />
                </Field>
                <Field>
                    <FieldLabel htmlFor="set-cvv">CVV</FieldLabel>
                    <Input id="set-cvv" placeholder="123" />
                </Field>
            </FieldGroup>
            <FieldSeparator />
            <FieldLegend variant="label" description="The billing address associated with your payment method.">
                Billing address
            </FieldLegend>
            <Field>
                <FieldLabel htmlFor="set-comments">Comments</FieldLabel>
                <Input id="set-comments" placeholder="Anything we should know?" />
            </Field>
            <div className="flex gap-2">
                <Button type="submit" size="md">
                    Submit
                </Button>
                <Button type="button" variant="outline" size="md">
                    Save draft
                </Button>
            </div>
        </FieldSet>
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
