import { CopyButton } from '@/components-v2/ui/CopyButton';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v2/CopyButton',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="flex items-center gap-6">
            <div className="flex flex-col items-center gap-1">
                <CopyButton text="nango_sk_live_abc123def456" />
                <span className="story-section-heading">Default</span>
            </div>
            <div className="flex flex-col items-center gap-1">
                <CopyButton text="disabled" disabled />
                <span className="story-section-heading">Disabled</span>
            </div>
        </div>
    )
};
