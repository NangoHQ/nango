import { EmptyCard } from '@/components-v2/ui/EmptyCard';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof EmptyCard> = {
    component: EmptyCard,
    title: 'Components v2/EmptyCard',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <EmptyCard>
            <p className="text-text-secondary text-body-medium-regular">No integrations yet.</p>
            <p className="text-text-tertiary text-body-small-regular">Connect your first integration to get started.</p>
        </EmptyCard>
    )
};
