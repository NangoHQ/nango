import { useState } from 'react';

import { Checkbox } from '@/components/ui/Checkbox';
import { Field, FieldContent, FieldDescription, FieldLabel } from '../src/components/ui/field';

import type { CheckboxProps } from '@/components/ui/Checkbox';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Checkbox> = {
    title: 'App Components/UI/Checkbox',
    component: Checkbox,
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

const CHECKED = [
    ['Unchecked', false],
    ['Checked', true],
    ['Indeterminate', 'indeterminate']
] as const;

// Hover and focus are frozen with data-story-state; in the app they come from the pointer and keyboard focus (Tab).
const STATES: [string, Partial<CheckboxProps> & { 'data-story-state'?: string }][] = [
    ['Default', {}],
    ['Hover', { 'data-story-state': 'hover' }],
    ['Focus', { 'data-story-state': 'focus-visible' }],
    ['Disabled', { disabled: true }],
    ['Error', { 'aria-invalid': true }]
];

const SIZES = ['md', 'sm'] as const;

/** Every Checked × State × Size (Figma 2595:239). Toggle the theme toolbar for dark. */
export const States: Story = {
    render: () => (
        <div className="grid grid-cols-[96px_repeat(6,88px)] items-center gap-x-4 gap-y-4">
            <span />
            {CHECKED.map(([label]) =>
                SIZES.map((size) => (
                    <span key={`${label}-${size}`} className="story-section-heading">
                        {label === 'Indeterminate' ? 'Indet.' : label} {size}
                    </span>
                ))
            )}
            {STATES.map(([state, props]) => (
                <div key={state} className="contents">
                    <span className="story-section-heading">{state}</span>
                    {CHECKED.map(([label, checked]) =>
                        SIZES.map((size) => (
                            <span key={`${label}-${size}`}>
                                <Checkbox aria-label={`${label} ${state} ${size}`} checked={checked} size={size} {...props} />
                            </span>
                        ))
                    )}
                </div>
            ))}
        </div>
    )
};

/** Inline Field, control first. The whole row is clickable; Space toggles when the box is focused. */
export const WithLabel: Story = {
    render: () => (
        <div className="grid grid-cols-[repeat(2,280px)] gap-x-10 gap-y-6">
            {SIZES.map((size) => (
                <span key={size} className="story-section-heading">
                    Size {size}
                </span>
            ))}
            {SIZES.map((size) => (
                <Field key={size} orientation="inline">
                    <Checkbox size={size} defaultChecked />
                    <FieldLabel>Mark as production</FieldLabel>
                </Field>
            ))}
            {SIZES.map((size) => (
                <Field key={size} orientation="inline">
                    <Checkbox size={size} />
                    <FieldContent>
                        <FieldLabel>Use a different color in dark mode</FieldLabel>
                        <FieldDescription>Buttons and links switch when the user is in dark mode.</FieldDescription>
                    </FieldContent>
                </Field>
            ))}
            {SIZES.map((size) => (
                <Field key={size} orientation="inline">
                    <Checkbox size={size} disabled defaultChecked />
                    <FieldContent>
                        <FieldLabel>Require HMAC</FieldLabel>
                        <FieldDescription>Disabled: only admins can change this.</FieldDescription>
                    </FieldContent>
                </Field>
            ))}
            {SIZES.map((size) => (
                <div key={size} className="flex items-center gap-3">
                    <Checkbox size={size} aria-label="Select row" />
                    <span className="story-section-heading">No label (aria-label)</span>
                </div>
            ))}
        </div>
    )
};

const SCOPES = ['list', 'create', 'read', 'delete'] as const;
type Scope = (typeof SCOPES)[number];

/**
 * A parent with sm children in two columns. The parent is indeterminate when some children are checked: that's only ever
 * set from child state. Clicking it selects every child; clicking again clears them.
 */
export const ScopeGroup: Story = {
    render: function ScopeGroupStory() {
        const [selected, setSelected] = useState<Record<Scope, boolean>>({ list: true, create: false, read: true, delete: false });
        const count = SCOPES.filter((scope) => selected[scope]).length;
        const parent = count === SCOPES.length ? true : count === 0 ? false : 'indeterminate';
        const setAll = (value: boolean) => setSelected({ list: value, create: value, read: value, delete: value });

        return (
            <div className="flex w-[320px] flex-col gap-2">
                <Field orientation="inline">
                    <Checkbox checked={parent} onCheckedChange={(checked) => setAll(checked === true)} />
                    <FieldLabel>Integrations</FieldLabel>
                </Field>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 pl-6">
                    {SCOPES.map((scope) => (
                        <Field key={scope} orientation="inline">
                            <Checkbox
                                size="sm"
                                checked={selected[scope]}
                                onCheckedChange={(checked) => setSelected((prev) => ({ ...prev, [scope]: checked === true }))}
                            />
                            <FieldLabel>{scope}</FieldLabel>
                        </Field>
                    ))}
                </div>
            </div>
        );
    }
};
