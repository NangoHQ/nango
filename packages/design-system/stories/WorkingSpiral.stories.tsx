import { WorkingSpiral } from '@/pages/AgentPlayground/components/WorkingSpiral';

import type { SpiralPulse } from '@/pages/AgentPlayground/components/WorkingSpiral';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof WorkingSpiral> = {
    component: WorkingSpiral,
    title: 'Features/Agent Playground/WorkingSpiral',
    parameters: { layout: 'padded' },
    argTypes: { pulse: { control: 'inline-radio', options: ['ripple', 'gather', 'shimmer'] } }
};
export default meta;
type Story = StoryObj<typeof meta>;

const PULSES: { pulse: SpiralPulse; name: string }[] = [
    { pulse: 'ripple', name: '1. Ripple' },
    { pulse: 'gather', name: '2. Gather' },
    { pulse: 'shimmer', name: '5. Shimmer' }
];

const Indicator: React.FC<{ pulse: SpiralPulse; label: string }> = ({ pulse, label }) => (
    <div className="flex items-center gap-2 text-body-medium-regular text-text-secondary" role="status">
        <WorkingSpiral pulse={pulse} />
        <span className="animate-pulse">{label}</span>
    </div>
);

export const Compare: Story = {
    render: () => (
        <div className="grid w-fit grid-cols-[auto_auto_auto] items-center gap-x-10 gap-y-6">
            {PULSES.map(({ pulse, name }) => (
                <div key={pulse} className="contents">
                    <span className="text-body-small-regular text-text-tertiary">{name}</span>
                    <Indicator pulse={pulse} label="Thinking…" />
                    <div className="size-24 [&>svg]:size-full">
                        <WorkingSpiral pulse={pulse} />
                    </div>
                </div>
            ))}
        </div>
    )
};

export const Ripple: Story = { args: { pulse: 'ripple' } };
export const Gather: Story = { args: { pulse: 'gather' } };
export const Shimmer: Story = { args: { pulse: 'shimmer' } };

export const WithStatus: Story = {
    render: () => (
        <div className="flex flex-col gap-4">
            <Indicator pulse="ripple" label="Thinking…" />
            <Indicator pulse="ripple" label="Adding Linear…" />
        </div>
    )
};
