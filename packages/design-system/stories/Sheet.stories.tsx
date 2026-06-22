import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/Sheet';
import { Button } from '../src/components/ui/button';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Sheet> = {
    component: Sheet,
    title: 'Components/UI/Sheet',
    parameters: { layout: 'centered' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <Sheet>
            <SheetTrigger asChild>
                <Button variant="secondary" size="md">
                    Open sheet
                </Button>
            </SheetTrigger>
            <SheetContent>
                <SheetHeader>
                    <SheetTitle>Connection details</SheetTitle>
                    <SheetDescription>View and manage this connection&apos;s settings.</SheetDescription>
                </SheetHeader>
                <div className="p-4 text-text-secondary text-body-small-regular">Sheet content goes here.</div>
            </SheetContent>
        </Sheet>
    )
};
