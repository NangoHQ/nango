import { CopyText } from '@/components/ui/CopyText';
import { TooltipProvider } from '@/components-v2/ui/Tooltip';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v1/UI/CopyText',
    parameters: { layout: 'padded' },
    decorators: [
        (Story) => (
            <TooltipProvider>
                <Story />
            </TooltipProvider>
        )
    ]
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="bg-bg-black p-6 rounded-md flex items-center gap-4">
            <CopyText text="nango_sk_live_abc123def456">nango_sk_live_abc123def456</CopyText>
            <CopyText text="user-connection-id">connection-id</CopyText>
        </div>
    )
};
