import { ArrowUpRight, Check, X } from 'lucide-react';
import { Link } from 'react-router-dom';

import { CopyButton } from '@/components/ui/CopyButton';
import { cn } from '@/utils/utils';

import type { ChartSeries } from './types';
import type { ChartInteractions } from './useChartInteractions';

interface ChartLegendProps {
    series: ChartSeries[];
    interactions: ChartInteractions;
    /** In-app route for a series, when it points somewhere navigable — adds a "go to" link to that row. */
    seriesHref?: (series: ChartSeries) => string | undefined;
    /** The value to copy for a series, when it's worth copying — adds a copy button to that row. */
    seriesCopyValue?: (series: ChartSeries) => string | undefined;
    /** Fired when a series' value is copied. For analytics only — keeps this pattern PostHog-free. */
    onSeriesCopy?: (series: ChartSeries) => void;
    /** Fired when a series' "go to" link is followed. For analytics only. */
    onSeriesGoTo?: (series: ChartSeries) => void;
}

interface ChartStaticLegendProps {
    series: Pick<ChartSeries, 'key' | 'label' | 'color'>[];
}

/**
 * Interactive legend: hover a row to highlight its band, click the label to isolate, click the
 * swatch to hide/show. On hover (or keyboard focus) a row also reveals per-series actions the caller
 * opts into: a copy button when {@link ChartLegendProps.seriesCopyValue} returns a value, and a "go
 * to" link when {@link ChartLegendProps.seriesHref} resolves one.
 */
export const ChartLegend: React.FC<ChartLegendProps> = ({ series, interactions, seriesHref, seriesCopyValue, onSeriesCopy, onSeriesGoTo }) => {
    const { hidden, isSeriesHidden, toggleIsolate, toggleHidden, hoverSeries, unhoverSeries, hoveredKey } = interactions;
    return (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 pt-3 pb-1 flex-shrink-0 text-[13px]">
            {series.map((s) => {
                const dimmed = isSeriesHidden(s.key);
                // Per-row actions, both opt-in per series via the caller: a copy value and a "go to" route.
                const href = seriesHref?.(s);
                const copyValue = seriesCopyValue?.(s);
                // Render UUID values (connection ids, etc.) monospace so their equal-width rows line up as a grid.
                const isUuid = Boolean(s.value) && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.value ?? '');
                // `active` = this series is the hovered one. It's set both by hovering the legend row and by
                // hovering the series' chart band (BreakdownChart calls hoverSeries on band enter), so highlight
                // stays in sync in both directions.
                const active = hoveredKey === s.key;
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
                    <div key={s.key} className="flex min-w-0 max-w-full">
                        <div
                            className={cn(
                                'group/row inline-flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors hover:bg-state-hover',
                                active && 'bg-state-hover'
                            )}
                        >
                            {/* Checkbox-style swatch: a color-filled square with a ring (a darker shade of its own color)
                                so it reads as a control at rest. OFF = empty square (neutral ring, no fill). Hovering the
                                swatch directly swaps it for a cross — or a check, if the series is already hidden. */}
                            <button {...toggleProps} className="group/swatch relative flex size-[18px] shrink-0 items-center justify-center">
                                <span
                                    className={cn(
                                        // border-box keeps the outer size fixed, so a thicker border on hover grows inward, not outward.
                                        'block size-3.5 rounded-[3px] border transition group-hover/swatch:opacity-0',
                                        dimmed
                                            ? 'border-border-default'
                                            : cn(
                                                  '[border-color:color-mix(in_srgb,var(--swatch),#000_28%)] group-hover/row:border-[1.5px] group-hover/row:[border-color:color-mix(in_srgb,var(--swatch),#000_45%)]',
                                                  active && 'border-[1.5px] [border-color:color-mix(in_srgb,var(--swatch),#000_45%)]'
                                              )
                                    )}
                                    style={dimmed ? undefined : ({ backgroundColor: s.color, ['--swatch']: s.color } as React.CSSProperties)}
                                />
                                {hidden.has(s.key) ? (
                                    <Check className="pointer-events-none absolute size-4 text-text-secondary opacity-0 transition-opacity group-hover/swatch:opacity-100" />
                                ) : (
                                    <X className="pointer-events-none absolute size-4 text-text-secondary opacity-0 transition-opacity group-hover/swatch:opacity-100" />
                                )}
                            </button>
                            {/* Clicking the label isolates this series; clicking again shows all. */}
                            <button
                                type="button"
                                onClick={() => toggleIsolate(s.key)}
                                onMouseEnter={onEnter}
                                onMouseLeave={onLeave}
                                className={cn(
                                    'relative min-w-0 max-w-full overflow-x-auto whitespace-nowrap text-left transition-colors',
                                    isUuid && 'font-mono text-[12px]',
                                    dimmed
                                        ? 'text-text-muted line-through hover:text-text-secondary'
                                        : cn('text-text-secondary group-hover/row:text-text-strong', active && 'text-text-strong')
                                )}
                                title={s.label}
                            >
                                {s.label}
                            </button>
                            {(copyValue || href) && (
                                // Actions revealed on hover/focus, in clean space to the right of the label. Their
                                // width is reserved at rest (they're laid out but transparent) so fading them in never
                                // changes the row's width — otherwise, in this content-sized wrap layout, the row would
                                // grow on hover and reflow the wrapped rows below it.
                                <div className="flex shrink-0 items-center gap-0.5 text-text-secondary opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 group-focus-within/row:opacity-100">
                                    {copyValue && <CopyButton text={copyValue} className="size-5 p-0" onCopy={() => onSeriesCopy?.(s)} />}
                                    {href && (
                                        <Link
                                            to={href}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onSeriesGoTo?.(s);
                                            }}
                                            aria-label={`Go to ${s.label}`}
                                            title={`Go to ${s.label}`}
                                            className="flex size-5 items-center justify-center rounded text-text-secondary transition-colors hover:text-text-strong focus-default"
                                        >
                                            <ArrowUpRight className="size-3.5" />
                                        </Link>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

/** Static legend: same visual rhythm as ChartLegend, without hide/isolate interactions. */
export const ChartStaticLegend: React.FC<ChartStaticLegendProps> = ({ series }) => {
    return (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 pt-3 pb-1 flex-shrink-0 text-[13px]">
            {series.map((s) => (
                <div key={s.key} className="flex min-w-0 max-w-full">
                    <div className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md px-1 py-0.5">
                        <span className="relative flex size-[18px] shrink-0 items-center justify-center" aria-hidden>
                            <span
                                className="block size-3.5 rounded-[3px] border [border-color:color-mix(in_srgb,var(--swatch),#000_28%)]"
                                style={{ backgroundColor: s.color, ['--swatch']: s.color } as React.CSSProperties}
                            />
                        </span>
                        <span className="text-text-secondary min-w-0 max-w-full overflow-x-auto whitespace-nowrap" title={s.label}>
                            {s.label}
                        </span>
                    </div>
                </div>
            ))}
        </div>
    );
};
