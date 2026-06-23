import { Input } from './input';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Design System/Components/Input',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

// Hover and focus are interaction states — inspect them live in the canvas; they can't be forced statically.
export const States: Story = {
    render: () => (
        <div className="flex flex-col gap-4 w-72">
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Default</span>
                <Input placeholder="Enter API key…" />
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Filled</span>
                <Input defaultValue="nango_sk_live_abc123" />
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Disabled</span>
                <Input placeholder="Disabled" disabled />
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Invalid</span>
                <Input defaultValue="bad value" aria-invalid />
            </div>
        </div>
    )
};

export const Password: Story = {
    render: () => (
        <div className="flex flex-col gap-4 w-72">
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Empty</span>
                <Input type="password" placeholder="Enter secret…" />
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Filled</span>
                <Input type="password" defaultValue="super-secret-value" />
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Disabled</span>
                <Input type="password" defaultValue="super-secret-value" disabled />
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Invalid</span>
                <Input type="password" defaultValue="bad" aria-invalid />
            </div>
        </div>
    )
};
