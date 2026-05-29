import { Button } from '@/components-v2/ui/Button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components-v2/ui/DropdownMenu';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof DropdownMenu> = {
    component: DropdownMenu,
    title: 'Components v2/UI/DropdownMenu',
    parameters: { layout: 'centered' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm">
                    Actions
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
                <DropdownMenuItem>View details</DropdownMenuItem>
                <DropdownMenuItem>Edit configuration</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
};
