import { Button } from '@/components/ui/button/Button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/Dialog';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v1/Dialog',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="bg-bg-black p-6 rounded-md">
            <Dialog>
                <DialogTrigger asChild>
                    <Button variant="zombie">Open dialog</Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogTitle>Confirm deletion</DialogTitle>
                    <DialogDescription>This action cannot be undone.</DialogDescription>
                    <div className="flex justify-end gap-2 mt-4">
                        <Button variant="zinc" size="sm">Cancel</Button>
                        <Button variant="danger" size="sm">Delete</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
};
