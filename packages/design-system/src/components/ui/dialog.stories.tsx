import { Button } from './button';
import { Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './dialog';

import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Components/Dialog',
    parameters: { layout: 'centered' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <Dialog>
            <DialogTrigger asChild>
                <Button>Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Dialog title</DialogTitle>
                    <DialogDescription>This is a dialog description.</DialogDescription>
                </DialogHeader>
                <DialogBody>
                    <p className="text-text-secondary text-ds-md">Body content goes here — forms, text, or any custom content.</p>
                </DialogBody>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button variant="primary">Save changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
};
