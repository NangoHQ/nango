import { useState } from 'react';

import { ConfirmDialog } from '@/components/patterns/ConfirmDialog';
import { Button } from '../../src/components/ui/button';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components/Patterns/ConfirmDialog',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => {
        const [open, setOpen] = useState(false);
        return (
            <>
                <Button variant="secondary" size="md" onClick={() => setOpen(true)}>
                    Open dialog
                </Button>
                <ConfirmDialog
                    open={open}
                    onOpenChange={setOpen}
                    title="Disconnect integration"
                    description="This will remove all connections and stop all syncs for this integration."
                    confirmButtonText="Disconnect"
                    confirmVariant="destructive"
                    onConfirm={() => setOpen(false)}
                />
            </>
        );
    }
};
