import { AreaChart, BarChart3 } from 'lucide-react';

import { cn } from '@/utils/utils';

export type ChartMode = 'daily' | 'cumulative';

interface ChartModeToggleProps {
    mode: ChartMode;
    onChange: (mode: ChartMode) => void;
}

const OPTIONS: { value: ChartMode; label: string; Icon: typeof AreaChart }[] = [
    { value: 'cumulative', label: 'Cumulative', Icon: AreaChart },
    { value: 'daily', label: 'Daily', Icon: BarChart3 }
];

/** Segmented control to switch a counter metric's drill-in between the cumulative and daily views. */
export const ChartModeToggle: React.FC<ChartModeToggleProps> = ({ mode, onChange }) => (
    <div className="flex items-center h-7 rounded-[2px] border-[0.5px] border-border-interactive text-body-small-regular">
        {OPTIONS.map(({ value, label, Icon }, i) => (
            <button
                key={value}
                type="button"
                onClick={() => onChange(value)}
                className={cn(
                    'flex items-center gap-1 px-2.5 h-full transition-colors focus-visible:outline-none focus-visible:shadow-focus-outline-default focus-visible:relative focus-visible:z-10',
                    i === 0 ? 'rounded-l-[1.5px]' : 'rounded-r-[1.5px] border-l-[0.5px] border-border-interactive',
                    mode === value ? 'bg-surface-panel-inset text-text-strong' : 'text-text-secondary hover:text-text-strong'
                )}
            >
                <Icon className="size-3.5" />
                {label}
            </button>
        ))}
    </div>
);
