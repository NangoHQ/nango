import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v1/Alert',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="bg-bg-black p-6 rounded-md flex flex-col gap-4 max-w-xl">
            <Alert variant="default">
                <AlertTitle>Info</AlertTitle>
                <AlertDescription>Your integration is connected and syncing data.</AlertDescription>
            </Alert>
            <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>Sync failed — could not reach the upstream API.</AlertDescription>
            </Alert>
            <Alert variant="warning">
                <AlertTitle>Warning</AlertTitle>
                <AlertDescription>Your access token expires in 3 days.</AlertDescription>
            </Alert>
        </div>
    )
};
