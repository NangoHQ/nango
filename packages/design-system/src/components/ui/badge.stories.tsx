import { Badge } from './badge';

import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Components/Badge',
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

const VARIANTS = ['default', 'secondary', 'outline', 'brand', 'success', 'warning', 'danger'] as const;

export const Default: Story = {
    render: () => (
        <div className="flex flex-wrap items-center gap-6">
            {VARIANTS.map((variant) => (
                <Badge key={variant} variant={variant} case="capitalize">
                    {variant}
                </Badge>
            ))}
        </div>
    )
};
