import { useState } from 'react';

import { Button } from '@/components-v2/ui/Button';
import { ConfirmDialog } from '@/components-v2/patterns/ConfirmDialog';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v2/Patterns/ConfirmDialog',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => {
        const [open, setOpen] = useState(false);
        return (
            <>
                <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>Open dialog</Button>
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
