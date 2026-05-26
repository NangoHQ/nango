import { Plus } from 'lucide-react';

import { IconButton } from './icon-button';

import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Components/Buttons/IconButton',
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

const VARIANTS = ['primary', 'secondary', 'outline', 'ghost', 'danger'] as const;
const SIZES = ['xxs', 'xs', 'sm', 'md', 'lg'] as const;

export const AllVariants: Story = {
    name: 'All variants',
    render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-10)' }}>
            {VARIANTS.map((variant) => (
                <div key={variant} style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-6)', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 'var(--ds-typography-font-size-xs)', color: 'var(--text-secondary)', width: '5rem', flexShrink: 0 }}>
                        {variant}
                    </span>
                    <IconButton variant={variant} label={`${variant} default`}>
                        <Plus />
                    </IconButton>
                    <IconButton variant={variant} disabled label={`${variant} disabled`}>
                        <Plus />
                    </IconButton>
                    <IconButton variant={variant} loading label={`${variant} loading`} />
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
                    <IconButton size={size} label={`${size} primary`}>
                        <Plus />
                    </IconButton>
                    <IconButton size={size} variant="outline" label={`${size} outline`}>
                        <Plus />
                    </IconButton>
                    <IconButton size={size} variant="ghost" label={`${size} ghost`}>
                        <Plus />
                    </IconButton>
                </div>
            ))}
        </div>
    )
};
