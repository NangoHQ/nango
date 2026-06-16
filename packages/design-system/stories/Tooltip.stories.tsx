import { Button } from '../src/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components/UI/Tooltip',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="flex items-center gap-8 p-8">
            {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                <Tooltip key={side}>
                    <TooltipTrigger asChild>
                        <Button variant="secondary" size="md">
                            {side}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side={side}>Syncs data every 30 minutes</TooltipContent>
                </Tooltip>
            ))}
        </div>
    )
};
