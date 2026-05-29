import { Separator } from '@/components-v2/ui/Separator';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v2/Separator',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="flex flex-col gap-8 w-64">
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Horizontal</span>
                <div>
                    <p className="text-text-primary text-body-small-regular">Above</p>
                    <Separator className="my-3" />
                    <p className="text-text-primary text-body-small-regular">Below</p>
                </div>
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Vertical</span>
                <div className="flex items-center gap-2 h-6">
                    <span className="text-text-primary text-body-small-regular">Left</span>
                    <Separator orientation="vertical" className="h-full" />
                    <span className="text-text-primary text-body-small-regular">Right</span>
                </div>
            </div>
        </div>
    )
};
