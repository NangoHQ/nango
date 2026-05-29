import { Progress } from '@/components/ui/Progress';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v1/UI/Progress',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="bg-bg-black p-6 rounded-md flex flex-col gap-4 w-72">
            {([0, 25, 60, 100] as const).map((val) => (
                <div key={val} className="flex flex-col gap-1">
                    <span className="story-section-heading">{val}%</span>
                    <Progress value={val} />
                </div>
            ))}
        </div>
    )
};
