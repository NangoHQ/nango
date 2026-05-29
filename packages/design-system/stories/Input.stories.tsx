import { Input } from '@/components-v2/ui/Input';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v2/UI/Input',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="flex flex-col gap-4 w-72">
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Empty</span>
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
                <span className="story-section-heading">Error</span>
                <Input defaultValue="bad value" aria-invalid />
            </div>
        </div>
    )
};
