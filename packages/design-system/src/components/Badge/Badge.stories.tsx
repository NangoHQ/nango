import { Circle } from 'lucide-react';

import { Badge } from './Badge';
import { FilterBadge } from './FilterBadge';

import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Components/Badge',
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
                <div key={shape} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-4)' }}>
                    <span style={{ fontSize: 'var(--ds-typography-font-size-xs)', color: 'var(--text-secondary)' }}>{shape}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-4)', flexWrap: 'wrap' }}>
                        {BADGE_VARIANTS.map((variant) => (
                            <Badge key={variant} variant={variant} shape={shape}>
                                {variant}
                            </Badge>
                        ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-4)', flexWrap: 'wrap' }}>
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

export const FilterBadges: Story = {
    name: 'FilterBadge',
    render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-10)' }}>
            <div style={{ display: 'flex', gap: 'var(--ds-space-6)', flexWrap: 'wrap', alignItems: 'center' }}>
                <FilterBadge>Unselected</FilterBadge>
                <FilterBadge selected>Selected</FilterBadge>
                <FilterBadge disabled>Disabled</FilterBadge>
                <FilterBadge selected disabled>
                    Selected disabled
                </FilterBadge>
            </div>
            <div style={{ display: 'flex', gap: 'var(--ds-space-6)', flexWrap: 'wrap', alignItems: 'center' }}>
                <FilterBadge leadingIcon={<Circle size={8} fill="currentColor" />}>With icon</FilterBadge>
                <FilterBadge selected leadingIcon={<Circle size={8} fill="currentColor" />}>
                    Selected icon
                </FilterBadge>
                <FilterBadge disabled leadingIcon={<Circle size={8} fill="currentColor" />}>
                    Disabled icon
                </FilterBadge>
            </div>
        </div>
    )
};
