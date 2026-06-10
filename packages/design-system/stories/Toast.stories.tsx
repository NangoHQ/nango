import { Toast } from '@/components/ui/Toast';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Toast> = {
    component: Toast,
    title: 'Components/UI/Toast',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = {
    args: { id: 1, variant: 'success', title: 'Sync complete', description: 'All records have been imported.' }
};

export const Error: Story = {
    args: { id: 2, variant: 'error', title: 'Sync failed', description: 'Could not reach the upstream API.' }
};

export const Info: Story = {
    args: { id: 3, variant: 'info', title: 'Sync started', description: 'Fetching contacts from HubSpot.' }
};
