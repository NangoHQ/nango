import { Button } from '@/components/ui/button/Button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v1/Tooltip',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="bg-bg-black p-8 rounded-md flex items-center gap-8">
            {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                <TooltipProvider key={side} delayDuration={0}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="zombie" size="sm">{side}</Button>
                        </TooltipTrigger>
                        <TooltipContent side={side}>Syncs every 30 min</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            ))}
        </div>
    )
};
