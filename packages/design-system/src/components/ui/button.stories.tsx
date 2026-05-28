import { ChevronRight, Plus } from 'lucide-react';

import { Button } from './button';

import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Components/Buttons/Button',
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

const VARIANTS = ['primary', 'secondary', 'outline', 'ghost', 'danger', 'link-danger'] as const;
const SIZES = ['xs', 'sm', 'md', 'lg'] as const;

export const AllVariants: Story = {
    name: 'All variants',
    render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-10)' }}>
            {VARIANTS.map((variant) => (
                <div key={variant} style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-6)', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 'var(--ds-typography-font-size-xs)', color: 'var(--text-secondary)', width: '7rem', flexShrink: 0 }}>
                        {variant}
                    </span>
                    <Button variant={variant}>Default</Button>
                    <Button variant={variant} disabled>
                        Disabled
                    </Button>
                    <Button variant={variant} loading>
                        Loading
                    </Button>
                    <Button variant={variant} leadingIcon={<Plus size={14} />}>
                        With icon
                    </Button>
                    <Button variant={variant} trailingIcon={<ChevronRight size={14} />}>
                        Trailing
                    </Button>
                </div>
            ))}
        </div>
    )
};

export const AllSizes: Story = {
    name: 'All sizes',
    render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-10)' }}>
            {SIZES.map((size) => (
                <div key={size} style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-6)' }}>
                    <span style={{ fontSize: 'var(--ds-typography-font-size-xs)', color: 'var(--text-secondary)', width: '3rem', flexShrink: 0 }}>{size}</span>
                    <Button size={size}>Button</Button>
                    <Button size={size} variant="outline">
                        Outline
                    </Button>
                    <Button size={size} leadingIcon={<Plus size={14} />}>
                        With icon
                    </Button>
                </div>
            ))}
        </div>
    )
};
