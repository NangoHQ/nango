import { Circle } from 'lucide-react';

import { Badge } from './Badge';

import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Components/Badges/Badge',
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

const BADGE_VARIANTS = ['default', 'secondary', 'outline', 'ghost', 'danger', 'verified'] as const;
const SHAPES = ['rectangle', 'pill'] as const;

export const AllVariants: Story = {
    name: 'All variants',
    render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-10)' }}>
            {SHAPES.map((shape) => (
                <div key={shape} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-6)' }}>
                    <span style={{ fontSize: 'var(--ds-typography-font-size-xs)', color: 'var(--text-secondary)' }}>{shape}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-6)', flexWrap: 'wrap' }}>
                        {BADGE_VARIANTS.map((variant) => (
                            <Badge key={variant} variant={variant} shape={shape}>
                                {variant}
                            </Badge>
                        ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-6)', flexWrap: 'wrap' }}>
                        {BADGE_VARIANTS.map((variant) => (
                            <Badge key={variant} variant={variant} shape={shape} leadingIcon={<Circle size={8} fill="currentColor" />}>
                                {variant}
                            </Badge>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
};
