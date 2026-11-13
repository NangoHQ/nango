import { Input } from './input';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Input> = {
    title: 'Design System/Components/Input',
    component: Input,
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

// A bare Input shares InputGroup's tokens and states. Hover is frozen with data-story-state; focus is driven by
// real browser focus — click into a field. Prefer InputGroup when the field needs an addon.
export const States: Story = {
    render: () => (
        <div className="grid grid-cols-[96px_repeat(2,260px)] items-center gap-x-4 gap-y-3">
            <span />
            <span className="story-section-heading">Text</span>
            <span className="story-section-heading">Mono</span>
            {(
                [
                    ['Default', { placeholder: 'Placeholder' }],
                    ['Hover', { placeholder: 'Placeholder', 'data-story-state': 'hover' }],
                    ['Filled', { defaultValue: 'production' }],
                    ['Read-only', { readOnly: true, defaultValue: 'a0583184-a6ef-40e5-b716-2d7aeacf84b3' }],
                    ['Disabled', { disabled: true, defaultValue: 'production' }],
                    ['Error', { 'aria-invalid': true, defaultValue: 'Dev Env' }],
                    ['Password', { type: 'password', defaultValue: 'super-secret-value' }],
                    ['Size sm', { size: 'sm', defaultValue: 'production' }]
                ] as const
            ).map(([label, props]) => (
                <div key={label} className="contents">
                    <span className="story-section-heading">{label}</span>
                    <Input {...props} />
                    <Input mono {...props} />
                </div>
            ))}
        </div>
    )
};
