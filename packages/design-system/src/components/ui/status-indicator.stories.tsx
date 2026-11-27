import { StatusIndicator } from './status-indicator';

import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Components/Status Indicator',
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

const TONES = ['neutral', 'muted', 'success', 'info', 'warning', 'danger'] as const;

export const Default: Story = {
    render: () => (
        <div className="flex flex-col gap-4">
            {(['md', 'sm'] as const).map((size) => (
                <div key={size} className="flex flex-wrap items-center gap-6 type-text-regular-sm text-text-default">
                    {TONES.map((tone) => (
                        <StatusIndicator key={tone} tone={tone} size={size}>
                            {tone}
                        </StatusIndicator>
                    ))}
                    <StatusIndicator tone="info" size={size} pulse>
                        running
                    </StatusIndicator>
                    <StatusIndicator tone="neutral" size={size} hollow>
                        waiting
                    </StatusIndicator>
                </div>
            ))}
        </div>
    )
};
