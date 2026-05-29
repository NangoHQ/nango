import { fn } from 'storybook/test';

import { BinaryToggle } from '@/components-v2/ui/BinaryToggle';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v2/BinaryToggle',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="flex items-center gap-6">
            <div className="flex flex-col gap-2">
                <span className="story-section-heading">Off</span>
                <BinaryToggle value={false} offLabel="List" onLabel="Grid" onChange={fn()} />
            </div>
            <div className="flex flex-col gap-2">
                <span className="story-section-heading">On</span>
                <BinaryToggle value={true} offLabel="List" onLabel="Grid" onChange={fn()} />
            </div>
            <div className="flex flex-col gap-2">
                <span className="story-section-heading">Disabled</span>
                <BinaryToggle value={false} offLabel="List" onLabel="Grid" onChange={fn()} disabled />
            </div>
        </div>
    )
};
