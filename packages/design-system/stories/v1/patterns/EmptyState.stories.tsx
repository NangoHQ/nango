import { EmptyState } from '@/components/patterns/EmptyState';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v1/Patterns/EmptyState',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="bg-bg-black p-6 rounded-md max-w-2xl">
            <EmptyState title="No connections yet" help="Connect your first integration to start syncing data." />
        </div>
    )
};
