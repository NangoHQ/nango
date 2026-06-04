import { Bar, BarChart, XAxis, YAxis } from 'recharts';

import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components-v2/ui/Chart';

import type { ChartConfig } from '@/components-v2/ui/Chart';
import type { Meta, StoryObj } from '@storybook/react-vite';

const chartData = [
    { day: 'Mon', syncs: 42 },
    { day: 'Tue', syncs: 78 },
    { day: 'Wed', syncs: 55 },
    { day: 'Thu', syncs: 91 },
    { day: 'Fri', syncs: 63 }
];

const chartConfig: ChartConfig = {
    syncs: { label: 'Syncs', color: 'var(--color-brand-500)' }
};

const meta: Meta = {
    title: 'Components v2/UI/Chart',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <ChartContainer config={chartConfig} className="h-48 w-full max-w-md">
            <BarChart data={chartData}>
                <XAxis dataKey="day" />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="syncs" fill="var(--color-brand-500)" radius={4} />
            </BarChart>
        </ChartContainer>
    )
};
