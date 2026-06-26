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
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-2 gap-y-0.5 pt-3 pb-1 max-h-[88px] overflow-y-auto flex-shrink-0 text-xs">
            {series.map((s) => {
                const dimmed = isSeriesHidden(s.key);
                // Highlight this series' band when hovering its swatch or label. Skipped when the series is hidden.
                const onEnter = () => {
                    if (!dimmed) hoverSeries(s.key);
                };
                const onLeave = () => unhoverSeries();
                const toggleProps = {
                    type: 'button' as const,
                    onClick: () => toggleHidden(s.key),
                    onMouseEnter: onEnter,
                    onMouseLeave: onLeave,
                    'aria-pressed': hidden.has(s.key),
                    'aria-label': `${hidden.has(s.key) ? 'Show' : 'Hide'} ${s.label}`,
                    title: `Toggle ${s.label}`
                };
                return (
                    // The grid cell keeps column alignment; the inner pill hugs swatch + label so the
                    // hover background only covers the content, not the empty space across the cell.
                    <div key={s.key} className="flex min-w-0">
                        <div className="group/row inline-flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors hover:bg-state-selected-muted">
                            {/* Color chip. Row hover outlines it with a darker shade of its own color (border-box keeps the
                                size). Hovering the swatch directly fades the chip out and swaps in a cross — or a check, if the
                                series is already hidden — as the toggle cue. */}
                            <button {...toggleProps} className="group/swatch relative flex size-4 shrink-0 items-center justify-center">
                                <span
                                    className={cn(
                                        'block size-2.5 rounded-[2px] border-2 border-transparent transition group-hover/row:[border-color:color-mix(in_srgb,var(--swatch),#000_30%)] group-hover/swatch:opacity-0',
                                        dimmed ? 'opacity-30' : 'opacity-100'
                                    )}
                                    style={{ backgroundColor: s.color, ['--swatch']: s.color } as React.CSSProperties}
                                />
                                {hidden.has(s.key) ? (
                                    <Check className="pointer-events-none absolute size-3.5 text-text-secondary opacity-0 transition-opacity group-hover/swatch:opacity-100" />
                                ) : (
                                    <X className="pointer-events-none absolute size-3.5 text-text-secondary opacity-0 transition-opacity group-hover/swatch:opacity-100" />
                                )}
                            </button>
                            {/* Clicking the label isolates this series; clicking again shows all. */}
                            <button
                                type="button"
                                onClick={() => toggleIsolate(s.key)}
                                onMouseEnter={onEnter}
                                onMouseLeave={onLeave}
                                className={cn(
                                    'relative min-w-0 truncate transition-colors',
                                    dimmed ? 'text-text-muted line-through hover:text-text-secondary' : 'text-text-secondary group-hover/row:text-text-strong'
                                )}
                                title={s.label}
                            >
                                {s.label}
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
