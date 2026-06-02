import { useState } from 'react';

import { DestructiveActionModal } from '@/components-v2/patterns/DestructiveActionModal';
import { Button } from '@/components-v2/ui/Button';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof DestructiveActionModal> = {
    component: DestructiveActionModal,
    title: 'Components v2/Patterns/DestructiveActionModal',
    parameters: { layout: 'centered' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => {
        const [open, setOpen] = useState(false);
        return (
            <>
                <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
                    Delete integration
                </Button>
                <DestructiveActionModal
                    open={open}
                    onOpenChange={setOpen}
                    title="Delete GitHub integration"
                    description="This will permanently delete all connections and synced data for this integration."
                    inputLabel='Type "github" to confirm'
                    confirmationKeyword="github"
                    confirmButtonText="Delete"
                    onConfirm={() => setOpen(false)}
                />
            </>
        );
    }
};
