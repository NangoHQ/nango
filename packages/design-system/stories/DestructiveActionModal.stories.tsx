import { useState } from 'react';

import { DestructiveActionModal } from '@/components/patterns/DestructiveActionModal';
import { Button } from '../src/components/ui/button';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof DestructiveActionModal> = {
    component: DestructiveActionModal,
    title: 'Components/Patterns/DestructiveActionModal',
    parameters: { layout: 'centered' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => {
        const [open, setOpen] = useState(false);
        return (
            <>
                <Button variant="danger" size="md" onClick={() => setOpen(true)}>
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
