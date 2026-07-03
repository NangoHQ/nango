import { Textarea } from './textarea';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Design System/Components/Textarea',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const States: Story = {
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
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Invalid</span>
                <Textarea defaultValue="bad value" aria-invalid rows={3} />
            </div>
        </div>
    )
};
