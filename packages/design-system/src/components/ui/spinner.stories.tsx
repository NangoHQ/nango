import { Spinner } from './spinner';

import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta<typeof Spinner> = {
    title: 'Design System/Components/Spinner',
    component: Spinner,
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

export const AllSizes: Story = {
    name: 'All sizes',
    render: () => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-10)', flexWrap: 'wrap' }}>
            {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((size) => (
                <div key={size} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--ds-space-2)' }}>
                    <Spinner size={size} />
                    <span style={{ fontSize: 'var(--ds-typography-font-size-xs)', color: 'var(--text-secondary)' }}>{size}</span>
                </div>
            ))}
        </div>
    )
};
