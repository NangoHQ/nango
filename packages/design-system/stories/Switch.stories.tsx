import { useState } from 'react';

import { Switch } from '@/components/ui/Switch';
import { Field, FieldContent, FieldDescription, FieldLabel } from '../src/components/ui/field';

import type { SwitchProps } from '@/components/ui/Switch';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Switch> = {
    title: 'App Components/UI/Switch',
    component: Switch,
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

const CHECKED = [
    ['Off', false],
    ['On', true]
] as const;

// Hover and focus are frozen with data-story-state; in the app they come from the pointer and keyboard focus (Tab).
const STATES: [string, Partial<SwitchProps> & { 'data-story-state'?: string }][] = [
    ['Default', {}],
    ['Hover', { 'data-story-state': 'hover' }],
    ['Focus', { 'data-story-state': 'focus-visible' }],
    ['Disabled', { disabled: true }]
];

const SIZES = ['md', 'sm'] as const;

/** Every Checked × State × Size (Figma 2595:352). A switch has no error or status colours. Toggle the theme toolbar for dark. */
export const States: Story = {
    render: () => (
        <div className="grid grid-cols-[96px_repeat(4,88px)] items-center gap-x-4 gap-y-4">
            <span />
            {CHECKED.map(([label]) =>
                SIZES.map((size) => (
                    <span key={`${label}-${size}`} className="story-section-heading">
                        {label} {size}
                    </span>
                ))
            )}
            {STATES.map(([state, props]) => (
                <div key={state} className="contents">
                    <span className="story-section-heading">{state}</span>
                    {CHECKED.map(([label, checked]) =>
                        SIZES.map((size) => (
                            <span key={`${label}-${size}`}>
                                <Switch aria-label={`${label} ${state} ${size}`} checked={checked} size={size} {...props} />
                            </span>
                        ))
                    )}
                </div>
            ))}
        </div>
    )
};

/** Inline Field, control first. The whole row is clickable; Space toggles when the switch is focused. */
export const WithLabel: Story = {
    render: () => (
        <div className="grid grid-cols-[repeat(2,300px)] gap-x-10 gap-y-6">
            {SIZES.map((size) => (
                <span key={size} className="story-section-heading">
                    Size {size}
                </span>
            ))}
            {SIZES.map((size) => (
                <Field key={size} orientation="inline">
                    <Switch size={size} defaultChecked />
                    <FieldLabel>Show footer badge</FieldLabel>
                </Field>
            ))}
            {SIZES.map((size) => (
                <Field key={size} orientation="inline">
                    <Switch size={size} />
                    <FieldContent>
                        <FieldLabel>Sync failed</FieldLabel>
                        <FieldDescription>Send a webhook when a sync run fails.</FieldDescription>
                    </FieldContent>
                </Field>
            ))}
            {SIZES.map((size) => (
                <Field key={size} orientation="inline">
                    <Switch size={size} disabled defaultChecked />
                    <FieldContent>
                        <FieldLabel>Show &quot;Secured by Nango&quot;</FieldLabel>
                        <FieldDescription>Disabled: available on paid plans.</FieldDescription>
                    </FieldContent>
                </Field>
            ))}
            {SIZES.map((size) => (
                <div key={size} className="flex items-center gap-3">
                    <Switch size={size} aria-label="Enable function" />
                    <span className="story-section-heading">No label (aria-label)</span>
                </div>
            ))}
        </div>
    )
};

const EVENTS = [
    { key: 'created', label: 'Connection created', description: 'When a user finishes authorizing, whether it succeeds or fails.' },
    { key: 'refresh', label: 'Token refresh failed', description: 'When Nango can’t refresh a connection’s credentials.' },
    { key: 'deleted', label: 'Connection deleted', description: 'When a connection is deleted.' }
] as const;

/** Webhook event toggles: switch rows with descriptions. A switch applies immediately; no Save button. */
export const WebhookEvents: Story = {
    render: function WebhookEventsStory() {
        const [enabled, setEnabled] = useState<Record<(typeof EVENTS)[number]['key'], boolean>>({ created: true, refresh: true, deleted: false });
        return (
            <div className="flex w-[420px] flex-col gap-4">
                {EVENTS.map((event) => (
                    <Field key={event.key} orientation="inline">
                        <Switch checked={enabled[event.key]} onCheckedChange={(checked) => setEnabled((prev) => ({ ...prev, [event.key]: checked }))} />
                        <FieldContent>
                            <FieldLabel>{event.label}</FieldLabel>
                            <FieldDescription>{event.description}</FieldDescription>
                        </FieldContent>
                    </Field>
                ))}
            </div>
        );
    }
};
