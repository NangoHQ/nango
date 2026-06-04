import { CircleCheck, CircleX, Info, TriangleAlert } from 'lucide-react';

import { StatusWithIcon } from '@/components-v2/ui/StatusWithIcon';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v2/UI/StatusWithIcon',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

const ITEMS = [
    { variant: 'success', icon: <CircleCheck />, label: 'Success' },
    { variant: 'error', icon: <CircleX />, label: 'Error' },
    { variant: 'warning', icon: <TriangleAlert />, label: 'Warning' },
    { variant: 'neutral', icon: <Info />, label: 'Neutral' }
] as const;

export const Default: Story = {
    render: () => (
        <div className="flex items-center gap-6">
            {ITEMS.map(({ variant, icon, label }) => (
                <div key={variant} className="flex flex-col items-center gap-2">
                    <StatusWithIcon variant={variant} tooltipContent={label}>
                        {icon}
                    </StatusWithIcon>
                    <span className="story-section-heading">{label}</span>
                </div>
            ))}
        </div>
    )
};
