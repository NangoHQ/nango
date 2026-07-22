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
        <div className="flex flex-wrap items-center gap-3">
            {VARIANTS.map((variant) => (
                <Badge key={variant} variant={variant}>
                    {variant}
                </Badge>
            ))}
        </div>
    )
};

// Text is monospace by default (Figma "code/regular/xs"); `case` opts into upper/capitalize.
export const Casing: Story = {
    render: () => (
        <div className="flex flex-wrap items-center gap-3">
            <Badge>normal</Badge>
            <Badge case="capitalize">capitalize</Badge>
        </div>
    )
};
