import { Button } from '@/components-v2/ui/Button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components-v2/ui/Popover';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Popover> = {
    component: Popover,
    title: 'Components v2/UI/Popover',
    parameters: { layout: 'centered' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="secondary" size="sm">
                    Open popover
                </Button>
            </PopoverTrigger>
            <PopoverContent className="bg-bg-elevated border border-border-muted rounded p-4 text-text-primary text-body-small-regular">
                Configure sync frequency and field mappings here.
            </PopoverContent>
        </Popover>
    )
};
