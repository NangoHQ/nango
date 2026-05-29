import Spinner from '@/components/ui/Spinner';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v1/Spinner',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="bg-bg-black p-6 rounded-md flex items-center gap-8">
            {([2, 4, 6] as const).map((size) => (
                <div key={size} className="flex flex-col items-center gap-2">
                    <Spinner size={size} />
                    <span className="story-section-heading">size={size}</span>
                </div>
            ))}
        </div>
    )
};
