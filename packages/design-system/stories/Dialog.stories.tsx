import { Button } from '@/components-v2/ui/Button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components-v2/ui/Dialog';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Dialog> = {
    component: Dialog,
    title: 'Components v2/Dialog',
    parameters: { layout: 'centered' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="secondary" size="sm">
                    Open dialog
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Confirm action</DialogTitle>
                    <DialogDescription>This will revoke access for all connected users. Are you sure?</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="secondary" size="sm">
                        Cancel
                    </Button>
                    <Button variant="destructive" size="sm">
                        Confirm
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
};
