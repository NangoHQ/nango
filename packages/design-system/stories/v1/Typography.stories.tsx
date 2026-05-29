import { Typography } from '@/components/ui/typography/Typography';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v1/Typography',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

const VARIANTS = ['h1', 'h2', 'h3', 'h4', 'h5'] as const;

export const Default: Story = {
    render: () => (
        <div className="bg-bg-black p-6 rounded-md flex flex-col gap-4">
            {VARIANTS.map((variant) => (
                <div key={variant} className="flex items-center gap-4">
                    <span className="story-section-heading w-8 shrink-0">{variant}</span>
                    <Typography variant={variant}>Integration catalog</Typography>
                </div>
            ))}
        </div>
    )
};
