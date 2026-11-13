import { AreaChart, BarChart3 } from 'lucide-react';

import { SegmentedControl, SegmentedControlItem } from '@nangohq/design-system';

export type ChartMode = 'daily' | 'cumulative';

interface ChartModeToggleProps {
    mode: ChartMode;
    onChange: (mode: ChartMode) => void;
}

/** Segmented control to switch a counter metric's drill-in between the cumulative and daily views. */
export const ChartModeToggle: React.FC<ChartModeToggleProps> = ({ mode, onChange }) => (
    <SegmentedControl size="sm" aria-label="Chart view" value={mode} onValueChange={(next) => onChange(next as ChartMode)}>
        <SegmentedControlItem value="cumulative" icon={<AreaChart />}>
            Cumulative
        </SegmentedControlItem>
        <SegmentedControlItem value="daily" icon={<BarChart3 />}>
            Daily
        </SegmentedControlItem>
    </SegmentedControl>
);
