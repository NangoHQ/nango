import { Check, X } from 'lucide-react';

import { cn } from '@/utils/utils';

import type { ChartSeries } from './types';
import type { ChartInteractions } from './useChartInteractions';

interface ChartLegendProps {
    series: ChartSeries[];
    interactions: ChartInteractions;
}

/** Interactive legend: hover a row to highlight its band, click the label to isolate, click the swatch to hide/show. */
export const ChartLegend: React.FC<ChartLegendProps> = ({ series, interactions }) => {
    const { hidden, isSeriesHidden, toggleIsolate, toggleHidden, hoverSeries, unhoverSeries } = interactions;
    return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-3 gap-y-1.5 pt-3 max-h-[88px] overflow-y-auto flex-shrink-0 text-xs">
            {series.map((s) => {
                const dimmed = isSeriesHidden(s.key);
                return (
                    // Hovering a legend row highlights its band (dims the others), same as hovering the band.
                    <div
                        key={s.key}
                        className="flex min-w-0 items-center gap-1.5"
                        onMouseEnter={() => {
                            if (!dimmed) hoverSeries(s.key);
                        }}
                        onMouseLeave={() => unhoverSeries()}
                    >
                        {/* Hover the swatch to reveal ✕/✓; click to toggle this series off/on. */}
                        <button
                            type="button"
                            onClick={() => toggleHidden(s.key)}
                            className="group/swatch relative flex size-4 shrink-0 items-center justify-center"
                            aria-pressed={hidden.has(s.key)}
                            aria-label={`${hidden.has(s.key) ? 'Show' : 'Hide'} ${s.label}`}
                            title={`Toggle ${s.label}`}
                        >
                            <span
                                className={cn(
                                    'block h-2.5 w-2.5 rounded-[2px] transition-opacity group-hover/swatch:opacity-0',
                                    dimmed ? 'opacity-30' : 'opacity-100'
                                )}
                                style={{ backgroundColor: s.color }}
                            />
                            {hidden.has(s.key) ? (
                                <Check className="absolute size-3.5 text-text-secondary opacity-0 transition-opacity group-hover/swatch:opacity-100" />
                            ) : (
                                <X className="absolute size-3.5 text-text-secondary opacity-0 transition-opacity group-hover/swatch:opacity-100" />
                            )}
                        </button>
                        {/* Clicking the label isolates this series; clicking again shows all. */}
                        <button
                            type="button"
                            onClick={() => toggleIsolate(s.key)}
                            className={cn(
                                'min-w-0 truncate transition-colors',
                                dimmed ? 'text-text-tertiary line-through hover:text-text-secondary' : 'text-text-secondary hover:text-text-primary'
                            )}
                            title={s.label}
                        >
                            {s.label}
                        </button>
                    </div>
                );
            })}
        </div>
    );
};
