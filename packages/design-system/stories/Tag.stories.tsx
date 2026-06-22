import { Tag } from '@/components/ui/Tag';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components/UI/Tag',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

const VARIANTS = ['success', 'alert', 'info', 'warning', 'disabled', 'default', 'neutral'] as const;

export const Default: Story = {
    render: () => (
        <div className="flex items-center gap-3 flex-wrap">
            {VARIANTS.map((variant) => (
                <Tag key={variant} variant={variant}>
                    {variant}
                </Tag>
            ))}
        </div>
    )
};
