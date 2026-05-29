import { SimpleTooltip } from '@/components/ui/SimpleTooltip';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v1/SimpleTooltip',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="bg-bg-black p-8 rounded-md flex items-center gap-8">
            <SimpleTooltip tooltipContent="Sync fetches all contacts every hour">
                <span className="text-white text-sm border-b border-dashed border-gray-500 cursor-help">Hover me</span>
            </SimpleTooltip>
            <SimpleTooltip tooltipContent="This action cannot be undone" side="right">
                <span className="text-white text-sm border-b border-dashed border-gray-500 cursor-help">Right side</span>
            </SimpleTooltip>
        </div>
    )
};
