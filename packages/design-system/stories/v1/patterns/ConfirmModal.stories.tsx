import { useState } from 'react';

import { ConfirmModal } from '@/components/patterns/ConfirmModal';
import { Button } from '@/components-v2/ui/Button';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v1/Patterns/ConfirmModal',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => {
        const [loading, setLoading] = useState(false);
        return (
            <div className="bg-bg-black p-6 rounded-md">
                <ConfirmModal
                    title="Delete connection"
                    description="This will permanently remove the connection and all synced data."
                    confirmButtonText="Delete"
                    loading={loading}
                    trigger={
                        <Button variant="destructive" size="sm">
                            Delete connection
                        </Button>
                    }
                    onConfirm={() => setLoading(true)}
                />
            </div>
        );
    }
};
