import { Textarea } from '@/components-v2/ui/Textarea';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v2/Textarea',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="flex flex-col gap-4 w-80">
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Empty</span>
                <Textarea placeholder="Enter a description…" rows={3} />
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Filled</span>
                <Textarea defaultValue="This sync fetches all contacts from HubSpot." rows={3} />
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Disabled</span>
                <Textarea placeholder="Disabled" disabled rows={3} />
            </div>
        </div>
    )
};
