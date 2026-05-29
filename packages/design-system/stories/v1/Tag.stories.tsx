import { Tag } from '@/components/ui/label/Tag';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v1/Tag',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

const VARIANTS = ['success', 'alert', 'info', 'warning', 'gray', 'gray1', 'neutral'] as const;

export const Default: Story = {
    render: () => (
        <div className="bg-bg-black p-6 rounded-md flex items-center gap-3 flex-wrap">
            {VARIANTS.map((variant) => (
                <Tag key={variant} variant={variant}>{variant}</Tag>
            ))}
        </div>
    )
};
