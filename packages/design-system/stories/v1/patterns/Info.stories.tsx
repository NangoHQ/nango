import { Info } from '@/components/patterns/Info';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v1/Patterns/Info',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="bg-bg-black p-6 rounded-md flex flex-col gap-4 max-w-xl">
            <Info>Your integration is connected and syncing data every hour.</Info>
            <Info variant="destructive">Sync failed — could not reach the upstream API.</Info>
            <Info variant="warning" title="Token expiring">
                Your access token expires in 3 days.
            </Info>
        </div>
    )
};
