import { Skeleton } from '@/components-v2/ui/Skeleton';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v2/UI/Skeleton',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="flex flex-col gap-4 w-72">
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Lines</span>
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                </div>
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Block</span>
                <Skeleton className="h-20 w-full" />
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Avatar-like</span>
                <Skeleton className="size-10 rounded-full" />
            </div>
        </div>
    )
};
