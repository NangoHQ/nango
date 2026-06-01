import { Spinner } from '@/components-v2/ui/Spinner';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v2/UI/Spinner',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="flex items-center gap-6">
            <div className="flex flex-col items-center gap-2">
                <Spinner className="size-4" />
                <span className="story-section-heading">sm</span>
            </div>
            <div className="flex flex-col items-center gap-2">
                <Spinner className="size-6" />
                <span className="story-section-heading">md</span>
            </div>
            <div className="flex flex-col items-center gap-2">
                <Spinner className="size-8" />
                <span className="story-section-heading">lg</span>
            </div>
        </div>
    )
};
