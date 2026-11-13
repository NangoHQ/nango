import { Controller, useForm } from 'react-hook-form';

import { Button } from './button';
import { CopyInput } from './copy-input';
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSeparator, FieldSet } from './field';
import { Input } from './input';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupSwatch } from './input-group';
import { SecretInput } from './secret-input';

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
                {/* Don't mark required fields with * — mark the optional ones. */}
                <span className="story-section-heading">Optional</span>
                <Field>
                    <FieldLabel optional>Secondary URL</FieldLabel>
                    <Input mono placeholder="https://staging.example.com/webhooks/nango" />
                    <FieldDescription>For staging or a backup receiver.</FieldDescription>
                </Field>
            </div>
            <div className="flex w-48 flex-col gap-1">
                <span className="story-section-heading">Long label</span>
                <Field>
                    <FieldLabel htmlFor="field-long-label">
                        To confirm, type the environment name (production-environment-with-a-very-long-name) below:
                    </FieldLabel>
                    <Input id="field-long-label" placeholder="Environment name" />
                </Field>
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Invalid (with error)</span>
                {/* data-invalid on Field sets aria-invalid on the control and wires the error into aria-describedby */}
                <Field data-invalid>
                    <FieldLabel>Name</FieldLabel>
                    <Input mono defaultValue="Dev Env" />
                    <FieldError>Use 1–32 lowercase letters, numbers or hyphens.</FieldError>
                </Field>
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Disabled</span>
                <Field data-disabled>
                    <FieldLabel>Callback URL</FieldLabel>
                    <Input mono defaultValue="https://api.nango.dev/oauth/callback" disabled />
                    <FieldDescription>Only admins can change this.</FieldDescription>
                </Field>
            </div>
        </div>
    )
};

const ENV_ID = 'a0583184-a6ef-40e5-b716-2d7aeacf84b3';

// vertical (default) and horizontal (settings rows) × default / error / disabled.
export const Orientation: Story = {
    render: () => (
        <div className="flex flex-col gap-10">
            <div className="grid w-[960px] grid-cols-3 gap-8">
                <div className="flex flex-col gap-1">
                    <span className="story-section-heading">Vertical · default</span>
                    <Field>
                        <FieldLabel>Name</FieldLabel>
                        <Input mono defaultValue="dev" />
                        <FieldDescription>Lowercase, used in URLs and env variable names.</FieldDescription>
                    </Field>
                </div>
                <div className="flex flex-col gap-1">
                    <span className="story-section-heading">Vertical · error</span>
                    <Field data-invalid>
                        <FieldLabel>Name</FieldLabel>
                        <Input mono defaultValue="Dev Env" />
                        <FieldError>Use 1–32 lowercase letters, numbers or hyphens.</FieldError>
                    </Field>
                </div>
                <div className="flex flex-col gap-1">
                    <span className="story-section-heading">Vertical · disabled</span>
                    <Field data-disabled>
                        <FieldLabel>Name</FieldLabel>
                        <Input mono defaultValue="dev" disabled />
                        <FieldDescription>Lowercase, used in URLs and env variable names.</FieldDescription>
                    </Field>
                </div>
            </div>
            <div className="flex w-[720px] flex-col gap-6">
                <span className="story-section-heading">Horizontal · default / error / disabled</span>
                <Field orientation="horizontal">
                    <FieldContent>
                        <FieldLabel>Environment ID</FieldLabel>
                        <FieldDescription>Use it in API calls and when you contact support.</FieldDescription>
                    </FieldContent>
                    <CopyInput value={ENV_ID} />
                </Field>
                <Field orientation="horizontal" data-invalid>
                    <FieldContent>
                        <FieldLabel>Name</FieldLabel>
                        <FieldDescription>Lowercase, used in URLs and env variable names.</FieldDescription>
                    </FieldContent>
                    <Input mono defaultValue="Dev Env" />
                    <FieldError>Use 1–32 lowercase letters, numbers or hyphens.</FieldError>
                </Field>
                <Field orientation="horizontal" data-disabled>
                    <FieldContent>
                        <FieldLabel>Callback URL</FieldLabel>
                        <FieldDescription>Only admins can change this.</FieldDescription>
                    </FieldContent>
                    <Input mono defaultValue="https://api.nango.dev/oauth/callback" disabled />
                </Field>
            </div>
        </div>
    )
};

// orientation="inline": label beside a small control, e.g. a checkbox row. (Before the Dharma refresh this was `horizontal`.)
export const Inline: Story = {
    render: () => (
        <Field orientation="inline">
            <input type="checkbox" id="field-inline" />
            <FieldLabel htmlFor="field-inline">Show "Secured by Nango"</FieldLabel>
        </Field>
    )
};

// The Figma review frame (Dharma 2588:319), rebuilt from components.
export const ReviewFrame: Story = {
    render: () => (
        <div className="flex w-[400px] flex-col gap-6">
            <Field>
                <FieldLabel>Name</FieldLabel>
                <Input mono defaultValue="dev" />
                <FieldDescription>Lowercase, used in URLs and env variable names.</FieldDescription>
            </Field>
            <Field>
                <FieldLabel>Environment ID</FieldLabel>
                <CopyInput value={ENV_ID} />
                <FieldDescription>Use it in API calls and when you contact support.</FieldDescription>
            </Field>
            <Field>
                <FieldLabel>Secret key</FieldLabel>
                <SecretInput value="nango_sk_dev_7f2a9e1b3c5d8f0a2b4c6d8e0f1a34c9" />
            </Field>
            <Field>
                <FieldLabel optional>Secondary URL</FieldLabel>
                <Input mono placeholder="https://staging.example.com/webhooks/nango" />
                <FieldDescription>For staging or a backup receiver.</FieldDescription>
            </Field>
            <Field>
                <FieldLabel>Brand color</FieldLabel>
                <InputGroup>
                    <InputGroupAddon>
                        <InputGroupSwatch color="#007CA0" />
                    </InputGroupAddon>
                    <InputGroupInput mono defaultValue="#007CA0" />
                </InputGroup>
            </Field>
            <Field data-invalid>
                <FieldLabel>Name</FieldLabel>
                <Input mono defaultValue="Dev Env" />
                <FieldError>Use 1–32 lowercase letters, numbers or hyphens.</FieldError>
            </Field>
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
            <FieldSet>
                <FieldLegend variant="label" description="The billing address associated with your payment method.">
                    Billing address
                </FieldLegend>
                <Field>
                    <FieldLabel htmlFor="set-comments">Comments</FieldLabel>
                    <Input id="set-comments" placeholder="Anything we should know?" />
                </Field>
            </FieldSet>
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
