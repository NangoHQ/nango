import { useState } from 'react';

import { PeriodSelector } from '@/components-v2/patterns/PeriodSelector';
import { last24hPreset, logsPresets } from '@/utils/logs';

import type { Period } from '@/utils/dates';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof PeriodSelector> = {
    component: PeriodSelector,
    title: 'Components v2/Patterns/PeriodSelector',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => {
        const [period, setPeriod] = useState<Period | null>(last24hPreset.toPeriod());
        const [isLive, setIsLive] = useState(true);
        return (
            <PeriodSelector
                period={period}
                isLive={isLive}
                presets={logsPresets}
                defaultPreset={last24hPreset}
                onChange={(p, live) => {
                    setPeriod(p);
                    setIsLive(live);
                }}
            />
        );
    }
};
