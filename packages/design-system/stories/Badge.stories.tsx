import { Badge } from '@/components-v2/ui/Badge';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v2/UI/Badge',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

const VARIANTS = ['gray', 'secondary', 'brand', 'mint', 'pink', 'yellow', 'green', 'ghost'] as const;

export const Default: Story = {
    render: () => (
        <div className="flex items-center gap-3 flex-wrap">
            {VARIANTS.map((variant) => (
                <Badge key={variant} variant={variant}>
                    {variant}
                </Badge>
            ))}
        </div>
    )
};
