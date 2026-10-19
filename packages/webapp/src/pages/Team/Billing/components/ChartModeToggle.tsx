import { AreaChart, BarChart3 } from 'lucide-react';

import { SegmentedControl } from '@/components/ui/SegmentedControl';

import type { SegmentedControlOption } from '@/components/ui/SegmentedControl';

export type ChartMode = 'daily' | 'cumulative';

interface ChartModeToggleProps {
    mode: ChartMode;
    onChange: (mode: ChartMode) => void;
}

const OPTIONS: SegmentedControlOption<ChartMode>[] = [
    { value: 'cumulative', label: 'Cumulative', Icon: AreaChart },
    { value: 'daily', label: 'Daily', Icon: BarChart3 }
];

/** Segmented control to switch a counter metric's drill-in between the cumulative and daily views. */
export const ChartModeToggle: React.FC<ChartModeToggleProps> = ({ mode, onChange }) => (
    <SegmentedControl aria-label="Chart view" value={mode} onChange={onChange} options={OPTIONS} />
);
