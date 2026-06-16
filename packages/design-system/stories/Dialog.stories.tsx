import { Button } from '../src/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/Dialog';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Dialog> = {
    component: Dialog,
    title: 'Components/UI/Dialog',
    parameters: { layout: 'centered' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="secondary" size="md">
                    Open dialog
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Confirm action</DialogTitle>
                    <DialogDescription>This will revoke access for all connected users. Are you sure?</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="secondary" size="md">
                        Cancel
                    </Button>
                    <Button variant="danger" size="md">
                        Confirm
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
};
