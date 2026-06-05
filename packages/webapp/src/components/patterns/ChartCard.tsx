import { Check, Info, Loader2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Text, XAxis, YAxis } from 'recharts';

import { REST_SERIES_KEY } from './usageChartColors';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../ui/Chart';
import { InfoTooltip } from '../ui/InfoTooltip';
import { Skeleton } from '../ui/Skeleton';
import { cn } from '@/utils/utils';

import type { ApiBillingUsageMetric } from '@nangohq/types';
import type { TooltipProps } from 'recharts';

export function formatQuantity(quantity: number): string {
    return quantity.toLocaleString('en-US', {
        maximumFractionDigits: 2
    });
}

// Compact form for axis ticks so large values (e.g. function time in the billions)
// don't get clipped: 50_000_000 → "50M", 1_200_000_000 → "1.2B".
const compactFormatter = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
export function formatCompact(value: number): string {
    return compactFormatter.format(value);
}

/**
 * One series in a breakdown chart. `key` must be a CSS-safe identifier (the
 * shadcn chart wrapper derives `--color-<key>` from it), so callers pass
 * synthetic keys (`s0`, `s1`, …, `rest`) and carry the real dimension value in
 * `label`. Colors are applied directly to the chart elements, not via the
 * `--color-<key>` indirection.
 */
export interface ChartSeries {
    key: string;
    label: string;
    color: string;
    usage: { timeframeStart: string | Date; quantity: number }[];
}

interface ChartCardProps {
    isLoading: boolean;
    data?: ApiBillingUsageMetric;
    timeframe: { start: string; end: string };
    /** Right-aligned controls in the header (e.g. the breakdown dropdown). */
    headerActions?: React.ReactNode;
    /** Optional inline notice under the header (e.g. "breakdowns available from …"). */
    notice?: React.ReactNode;
    /** When provided, the chart renders these stacked series instead of the single total. */
    breakdownSeries?: ChartSeries[];
    breakdownLoading?: boolean;
    breakdownError?: boolean;
    /** Overrides the headline number (e.g. fixtures show their invented total, not the real base total). */
    totalOverride?: number;
}

function usageToDateMap(usage: { timeframeStart: string | Date; quantity: number }[]): Map<string, number> {
    const map = new Map<string, number>();
    usage.forEach((u) => {
        const dateStr = typeof u.timeframeStart === 'string' ? u.timeframeStart : u.timeframeStart.toISOString();
        map.set(dateStr.split('T')[0], u.quantity);
    });
    return map;
}

/** Days (YYYY-MM-DD, UTC) spanning the timeframe, end-exclusive. */
function daysInTimeframe(timeframe: { start: string; end: string }): string[] {
    const days: string[] = [];
    const currentDate = new Date(timeframe.start);
    currentDate.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(timeframe.end);
    endDate.setUTCHours(0, 0, 0, 0);
    while (currentDate < endDate) {
        days.push(currentDate.toISOString().split('T')[0]);
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }
    return days;
}

export const ChartCard: React.FC<ChartCardProps> = ({
    isLoading,
    data,
    timeframe,
    headerActions,
    notice,
    breakdownSeries,
    breakdownLoading,
    breakdownError,
    totalOverride
}) => {
    const isBreakdown = breakdownSeries !== undefined;

    // Legend interaction (breakdown mode), keyed by safe series key:
    // - `isolated`: clicking a label isolates that series (only it shown); clicking it again shows all.
    // - `hidden`: individually hidden series (via the ✕ revealed when hovering the swatch).
    const [hidden, setHidden] = useState<Set<string>>(new Set());
    const [isolated, setIsolated] = useState<string | null>(null);
    // Series hovered in the chart — its band is emphasized (others dimmed) and the tooltip narrows to it.
    const [hoveredKey, setHoveredKey] = useState<string | null>(null);

    // Clearing the hover is debounced so moving between contiguous bands (and across
    // the 1px seams between them) doesn't blink back to the unhovered / full-tooltip
    // state. Only a sustained move off the bands (above the stack) actually clears it.
    const clearHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hoverSeries = (key: string) => {
        if (clearHoverTimer.current) clearTimeout(clearHoverTimer.current);
        clearHoverTimer.current = null;
        setHoveredKey(key);
    };
    const unhoverSeries = () => {
        if (clearHoverTimer.current) clearTimeout(clearHoverTimer.current);
        clearHoverTimer.current = setTimeout(() => setHoveredKey(null), 80);
    };
    useEffect(
        () => () => {
            if (clearHoverTimer.current) clearTimeout(clearHoverTimer.current);
        },
        []
    );

    // A series is hidden in the chart when another series is isolated, or it's individually hidden.
    const isSeriesHidden = (key: string) => (isolated !== null ? key !== isolated : hidden.has(key));

    const toggleIsolate = (key: string) => {
        // Isolating a series also clears any individually-hidden ones, so toggling the
        // isolation back off reveals every series again rather than restoring the prior
        // hidden set. (Keep the same Set when already empty to avoid a needless render.)
        setHidden((prev) => (prev.size === 0 ? prev : new Set()));
        setIsolated((prev) => (prev === key ? null : key));
    };
    // Swatch ✕ toggles a series off/on. Clears any isolation so the toggle takes visible effect.
    const toggleHidden = (key: string) => {
        setIsolated(null);
        setHidden((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    const todayDateKey = useMemo(() => {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        return today.toISOString().split('T')[0];
    }, []);

    // Days after today have no data yet, so we leave them blank (null) instead of
    // plotting 0. That makes the chart end with a vertical edge at the present
    // rather than sloping down to zero across the rest of the month. A genuine 0
    // in the past keeps its value (and the smooth curve down), since only future
    // days are blanked. (String compare is safe — both are YYYY-MM-DD, UTC.)

    // Headline total + single-series chart are always derived from the base metric.
    const baseChartData = useMemo(() => {
        if (!data) return [];
        const usageMap = usageToDateMap(data.usage);
        return daysInTimeframe(timeframe).map((date) => ({ date, total: date > todayDateKey ? null : (usageMap.get(date) ?? undefined) }));
    }, [data?.usage, timeframe.start, timeframe.end, todayDateKey]);

    const breakdownChartData = useMemo(() => {
        if (!breakdownSeries) return [];
        const maps = breakdownSeries.map((s) => usageToDateMap(s.usage));
        return daysInTimeframe(timeframe).map((date) => {
            const row: Record<string, string | number | null> = { date };
            breakdownSeries.forEach((s, i) => {
                row[s.key] = date > todayDateKey ? null : (maps[i].get(date) ?? 0);
            });
            return row;
        });
    }, [breakdownSeries, timeframe.start, timeframe.end, todayDateKey]);

    // X-axis tick that renders today's day number brighter than the rest, so the
    // current date stands out on the axis itself — no extra gridline or marker.
    // Reuses recharts' <Text> so it sits exactly where the default ticks do; the
    // inline style is the only thing that beats the ChartContainer's
    // `.recharts-cartesian-axis-tick text` fill rule. Past months never match
    // todayDateKey, so nothing is highlighted there.
    const renderDayTick = (tickProps: {
        x?: number;
        y?: number;
        className?: string;
        fill?: string;
        textAnchor?: 'start' | 'middle' | 'end' | 'inherit';
        verticalAnchor?: 'start' | 'middle' | 'end';
        payload?: { value: string };
    }) => {
        const { payload, x, y, className, fill, textAnchor, verticalAnchor } = tickProps;
        const isToday = payload?.value === todayDateKey;
        return (
            <Text
                x={x}
                y={y}
                className={className}
                fill={fill}
                textAnchor={textAnchor}
                verticalAnchor={verticalAnchor}
                style={isToday ? { fill: 'var(--color-text-primary)' } : undefined}
            >
                {payload ? new Date(payload.value).getUTCDate() : ''}
            </Text>
        );
    };

    // "No data for this month" is a property of the base metric, independent of breakdown.
    const isEmpty = baseChartData.every((usage) => !usage.total || usage.total === 0);
    const isCumulative = data?.view_mode === 'cumulative';

    const chartConfig = useMemo(() => {
        if (isBreakdown) {
            return Object.fromEntries((breakdownSeries ?? []).map((s) => [s.key, { label: s.label, color: s.color }]));
        }
        return { total: { label: 'Total', color: 'var(--color-brand-500)' } };
    }, [isBreakdown, breakdownSeries]);

    const ChartComponent = isCumulative ? AreaChart : BarChart;
    const activeChartData = isBreakdown ? breakdownChartData : baseChartData;

    // Hovering a series emphasizes it by dimming the others; clicking it isolates the
    // series (same as clicking its legend label).
    const dimByHover = (key: string) => hoveredKey !== null && hoveredKey !== key;

    // Animations are disabled so swapping breakdown/dimension/top swaps the data
    // instantly rather than playing a slow morph between unrelated datasets.
    const chartElements = isBreakdown
        ? (breakdownSeries ?? []).map((s) =>
              isCumulative ? (
                  <Area
                      key={s.key}
                      dataKey={s.key}
                      stackId="usage"
                      fill={s.color}
                      stroke={s.color}
                      fillOpacity={dimByHover(s.key) ? 0.2 : 0.85}
                      strokeOpacity={dimByHover(s.key) ? 0.3 : 1}
                      strokeWidth={1}
                      type="basis"
                      dot={false}
                      // The active dot sits on top of the band, so without its own handlers
                      // hovering it drops `hoveredKey` and the tooltip reverts to the full-day
                      // list. Mirror the band's handlers so a dot behaves like its band.
                      activeDot={{
                          onMouseEnter: () => hoverSeries(s.key),
                          onMouseLeave: () => unhoverSeries(),
                          onClick: () => toggleIsolate(s.key)
                      }}
                      hide={isSeriesHidden(s.key)}
                      isAnimationActive={false}
                      onMouseEnter={() => hoverSeries(s.key)}
                      onMouseLeave={() => unhoverSeries()}
                      onClick={() => toggleIsolate(s.key)}
                  />
              ) : (
                  <Bar
                      key={s.key}
                      dataKey={s.key}
                      stackId="usage"
                      fill={s.color}
                      fillOpacity={dimByHover(s.key) ? 0.3 : 1}
                      hide={isSeriesHidden(s.key)}
                      isAnimationActive={false}
                      onMouseEnter={() => hoverSeries(s.key)}
                      onMouseLeave={() => unhoverSeries()}
                      onClick={() => toggleIsolate(s.key)}
                  />
              )
          )
        : isCumulative
          ? [<Area key="total" dataKey="total" fill="var(--color-total)" type="basis" strokeWidth={2} dot={false} isAnimationActive={false} />]
          : [<Bar key="total" dataKey="total" fill="var(--color-total)" isAnimationActive={false} />];

    // What occupies the chart body: a per-panel breakdown spinner/error, the empty state, or the chart.
    const showBreakdownSpinner = isBreakdown && breakdownLoading;
    const showBreakdownError = isBreakdown && !breakdownLoading && breakdownError;
    const hasBreakdownSeries = isBreakdown && (breakdownSeries?.length ?? 0) > 0;
    // A breakdown with series renders even when the base metric is empty (e.g. fixtures on a zero-usage metric).
    const effectiveEmpty = isEmpty && !hasBreakdownSeries;
    // Headline number: an explicit override (fixtures) wins, otherwise the real base total when present.
    const headlineTotal = totalOverride ?? (isEmpty ? undefined : data?.total);
    // Wait for the base metric to load before drawing — otherwise the chart briefly
    // renders with the wrong type (bars before `view_mode` is known) next to the spinner.
    const showChart = !isLoading && !effectiveEmpty && !showBreakdownSpinner && !showBreakdownError && (!isBreakdown || hasBreakdownSeries);

    return (
        <div className="bg-bg-elevated rounded border border-transparent h-[424px] flex flex-col">
            <header className="px-6 py-3 flex justify-between items-center border-b border-border-muted flex-shrink-0 gap-4">
                <div className="flex flex-col items-start justify-center h-11">
                    {isLoading || !data ? (
                        <Skeleton className="bg-bg-subtle h-4 w-32" />
                    ) : (
                        <>
                            <div className="flex items-center gap-1.5">
                                <span className="text-text-primary text-body-large-semi">{data.label}</span>
                                {isCumulative && (
                                    <InfoTooltip>
                                        This metric is billed as a running monthly average, so the value shown is the average over the selected month rather
                                        than a cumulative total.
                                    </InfoTooltip>
                                )}
                            </div>
                            {headlineTotal !== undefined && (
                                <div className="flex items-baseline gap-1.5">
                                    <span className="text-text-secondary text-body-medium-regular">{formatQuantity(headlineTotal)}</span>
                                    {isCumulative && <span className="text-text-tertiary text-body-small-regular">monthly average</span>}
                                </div>
                            )}
                        </>
                    )}
                </div>
                {headerActions && <div className="flex items-center gap-2 flex-shrink-0">{headerActions}</div>}
            </header>

            {notice && (
                <div className="px-6 pt-3 flex items-center gap-1.5 text-text-secondary text-body-small-regular flex-shrink-0">
                    <Info className="size-3.5 shrink-0" />
                    <span>{notice}</span>
                </div>
            )}

            <main className="px-6 py-4 flex-1 min-h-0 overflow-hidden flex flex-col">
                {showChart && (
                    <>
                        <ChartContainer config={chartConfig} className="flex-1 min-h-0 w-full">
                            <ChartComponent accessibilityLayer data={activeChartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barCategoryGap={4}>
                                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--color-border-muted)" />
                                <XAxis
                                    dataKey="date"
                                    tickLine={false}
                                    tickMargin={10}
                                    stroke="var(--color-bg-muted)"
                                    // tickFormatter still drives recharts' label-width / tick-spacing math even
                                    // though the custom tick re-derives the day number itself.
                                    tickFormatter={(value: string) => new Date(value).getUTCDate().toString()}
                                    tick={renderDayTick}
                                />
                                <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => formatCompact(value)} padding={{ top: 20 }} />
                                <ChartTooltip
                                    // Over a band → just that series; above the stack → the full per-day list.
                                    // (Hover clearing is debounced, so seams between bands don't flash the full list.)
                                    content={(props: TooltipProps<number, string>) => {
                                        const present = props.payload?.filter((p) => typeof p.value === 'number' && p.value !== 0);
                                        // Order rows by this day's value (highest first); 'Rest' always sinks to
                                        // the bottom. The payload arrives in stack order (sorted by month total),
                                        // which doesn't always match a single day's ranking.
                                        const sorted = present?.slice().sort((a, b) => {
                                            if (a.dataKey === REST_SERIES_KEY) return 1;
                                            if (b.dataKey === REST_SERIES_KEY) return -1;
                                            return (b.value ?? 0) - (a.value ?? 0);
                                        });
                                        const shown = hoveredKey ? sorted?.filter((p) => p.dataKey === hoveredKey) : sorted;
                                        return (
                                            <ChartTooltipContent
                                                active={props.active}
                                                label={props.label}
                                                payload={shown}
                                                labelFormatter={(value) =>
                                                    new Date(value).toLocaleDateString('en-US', {
                                                        day: 'numeric',
                                                        month: 'long',
                                                        year: 'numeric',
                                                        timeZone: 'UTC'
                                                    })
                                                }
                                            />
                                        );
                                    }}
                                    isAnimationActive={false}
                                />
                                {chartElements}
                            </ChartComponent>
                        </ChartContainer>

                        {breakdownSeries && breakdownSeries.length > 0 && (
                            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-3 gap-y-1.5 pt-3 max-h-[88px] overflow-y-auto flex-shrink-0 text-xs">
                                {breakdownSeries.map((s) => {
                                    const dimmed = isSeriesHidden(s.key);
                                    return (
                                        <div key={s.key} className="flex min-w-0 items-center gap-1.5">
                                            {/* Hover the swatch to reveal an ✕; click it to toggle this series off/on. */}
                                            <button
                                                type="button"
                                                onClick={() => toggleHidden(s.key)}
                                                className="group/swatch relative flex size-4 shrink-0 items-center justify-center"
                                                aria-label={`Toggle ${s.label}`}
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
                                                    dimmed
                                                        ? 'text-text-tertiary line-through hover:text-text-secondary'
                                                        : 'text-text-secondary hover:text-text-primary'
                                                )}
                                                title={s.label}
                                            >
                                                {s.label}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}

                {(isLoading || showBreakdownSpinner) && (
                    <div className="flex flex-col items-center justify-center flex-1">
                        <span className="text-text-secondary text-body-medium-regular">
                            <Loader2 className="animate-spin" />
                        </span>
                    </div>
                )}

                {showBreakdownError && (
                    <div className="flex flex-col items-center justify-center flex-1">
                        <span className="text-text-secondary text-body-medium-regular">Failed to load breakdown</span>
                    </div>
                )}

                {effectiveEmpty && !isLoading && !showBreakdownSpinner && !showBreakdownError && (
                    <div className="flex flex-col items-center justify-center flex-1">
                        <span className="text-text-secondary text-body-medium-regular">No data</span>
                    </div>
                )}
            </main>
        </div>
    );
};
