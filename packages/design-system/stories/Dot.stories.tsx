import { Dot } from '@/components-v2/ui/Dot';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v2/UI/Dot',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

const VARIANTS = ['brand', 'success', 'warning', 'error'] as const;

export const Default: Story = {
    render: () => (
        <div className="flex items-center gap-4">
            {VARIANTS.map((variant) => (
                <div key={variant} className="flex items-center gap-2">
                    <Dot variant={variant} />
                    <span className="story-section-heading">{variant}</span>
                </div>
            ))}
        </div>
    )
};
