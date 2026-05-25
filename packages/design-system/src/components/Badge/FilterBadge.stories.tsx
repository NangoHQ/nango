import { Circle } from 'lucide-react';

import { FilterBadge } from './FilterBadge';

import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Components/Badges/FilterBadge',
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

export const AllVariants: Story = {
    name: 'All variants',
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
