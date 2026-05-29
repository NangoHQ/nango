import { InfoTooltip } from '@/components-v2/ui/InfoTooltip';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v2/InfoTooltip',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="flex items-center gap-8 p-8">
            <div className="flex flex-col items-center gap-2">
                <InfoTooltip>Scopes define what data the integration can access.</InfoTooltip>
                <span className="story-section-heading">Top (default)</span>
            </div>
            <div className="flex flex-col items-center gap-2">
                <InfoTooltip side="right">Hover to see the tooltip on the right.</InfoTooltip>
                <span className="story-section-heading">Right</span>
            </div>
        </div>
    )
};
