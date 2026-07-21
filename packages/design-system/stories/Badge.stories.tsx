import { Badge } from '../src/components/ui/badge';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components/UI/Badge',
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
            <Badge case="upper">upper</Badge>
            <Badge case="capitalize">capitalize</Badge>
        </div>
    )
};
