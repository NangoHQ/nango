import { useCallback, useMemo } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, Text, XAxis, YAxis } from 'recharts';

import { formatQuantity } from '@/utils/utils';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../../ui/Chart';
import { REST_SERIES_KEY } from './usageChartColors';

import type { ChartConfig } from '../../ui/Chart';
import type { ChartSeries } from './types';
import type { ChartInteractions } from './useChartInteractions';
import type { TooltipProps } from 'recharts';

/** Day-of-month (UTC) for an axis tick: "2026-06-05" → 5. */
const dayOfMonth = (date: string) => new Date(date).getUTCDate();

/** Full date label for the tooltip: "2026-06-05" → "June 5, 2026". */
const formatTooltipDate = (date: string | number) =>
    new Date(date).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Nearest "nice" number (1, 2, 2.5, 5, 10 × 10ⁿ) ≥ x — for round tick steps. */
function niceStep(x: number): number {
    const base = 10 ** Math.floor(Math.log10(x));
    const frac = x / base;
    return (frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10) * base;
}

/** Round Y-axis ticks (0…top) so the axis reads "0, 50K, 100K", with the cap always a labelled tick and ~10% headroom above. */
function niceCapAxis(dataMax: number, capLine: number): { max: number; ticks: number[] } {
    const top = Math.max(dataMax, capLine, 1);
    const step = niceStep(top / 5);
    const ticks: number[] = [];
    for (let t = 0; t <= top + step / 2; t += step) ticks.push(t);
    // Force the cap in as a tick even if it's off the step grid.
    if (!ticks.some((t) => Math.abs(t - capLine) < step / 100)) {
        ticks.push(capLine);
        ticks.sort((a, b) => a - b);
    }
    return { max: top * 1.1, ticks };
}

interface BreakdownChartProps {
    /** Per-day rows: `{ date, total }` for the single series, or `{ date, [seriesKey]: value }` stacked. */
    chartData: Record<string, string | number | null | undefined>[];
    config: ChartConfig;
    /** Areas for running-average metrics, bars for counts. */
    isCumulative: boolean;
    /** Stacked breakdown vs. the single "total" series. */
    isBreakdown: boolean;
    series: ChartSeries[];
    todayDateKey: string;
    interactions: ChartInteractions;
    /** Draw a horizontal cap reference line at this value (the metric's plan limit). */
    capLine?: number;
}

/**
 * The recharts chart for a usage panel — a single "total" series, or a stacked
 * breakdown with hover/click interactions.
 */
export const BreakdownChart: React.FC<BreakdownChartProps> = ({
    chartData,
    config,
    isCumulative,
    isBreakdown,
    series,
    todayDateKey,
    interactions,
    capLine
}) => {
    const { hoveredKey, dimByHover, isSeriesHidden, hoverSeries, unhoverSeries, toggleIsolate } = interactions;
    // Clicking a band isolates that series (shows only it; click again shows all) — a
    // client-only view change, never a query change. Filtering lives on the Filter control.
    const bandClick = (s: ChartSeries) => () => toggleIsolate(s.key);
    const ChartComponent = isCumulative ? AreaChart : BarChart;

    // Stacking follows declaration order (first series = bottom), so pin the neutral
    // "Rest" bucket to the bottom; the sized series stack above it. The legend/tooltip keep their own order.
    const stackSeries = [...series.filter((s) => s.key === REST_SERIES_KEY), ...series.filter((s) => s.key !== REST_SERIES_KEY)];

    // One stacked Area/Bar per series in breakdown mode; otherwise the single "total" series.
    const renderSeries = () => {
        if (isBreakdown) {
            return stackSeries.map((s) => {
                if (isCumulative) {
                    return (
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
                            // The active dot sits on top of the band; mirror the band's handlers so
                            // hovering it doesn't drop the highlight / single-series tooltip.
                            activeDot={{ onMouseEnter: () => hoverSeries(s.key), onMouseLeave: () => unhoverSeries(), onClick: bandClick(s) }}
                            hide={isSeriesHidden(s.key)}
                            isAnimationActive={false}
                            onMouseEnter={() => hoverSeries(s.key)}
                            onMouseLeave={() => unhoverSeries()}
                            onClick={bandClick(s)}
                            className="cursor-pointer [&_path]:transition-[fill-opacity,stroke-opacity] [&_path]:duration-150"
                        />
                    );
                }
                return (
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
                        onClick={bandClick(s)}
                        className="cursor-pointer"
                    />
                );
            });
        }
        if (isCumulative) {
            return [
                <Area
                    key="total"
                    dataKey="total"
                    fill="var(--color-total)"
                    stroke="var(--color-total)"
                    type="basis"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                />
            ];
        }
        return [<Bar key="total" dataKey="total" fill="var(--color-total)" isAnimationActive={false} />];
    };
    const seriesElements = renderSeries();

    // With a cap line, pin the axis to round ticks with headroom above the cap (so its tick is a
    // nice number, not a fraction like 11.2). Sum per row so stacked breakdowns use the stack height.
    const capAxis = useMemo(() => {
        if (capLine === undefined) return null;
        let dataMax = 0;
        for (const row of chartData) {
            let rowSum = 0;
            for (const key in row) {
                const value = row[key];
                // Sum only the series currently drawn — isolating/hiding a slice rescales the axis so the
                // visible data (and the cap line) aren't flattened against the full stacked total.
                if (key !== 'date' && typeof value === 'number' && !isSeriesHidden(key)) rowSum += value;
            }
            if (rowSum > dataMax) dataMax = rowSum;
        }
        return niceCapAxis(dataMax, capLine);
    }, [chartData, capLine, isSeriesHidden]);

    // Today's day number is rendered brighter than the rest so the current date stands out
    // on the axis itself. Reuses recharts' <Text> so it sits where the default ticks do; the
    // inline style is the only thing that beats the ChartContainer's tick-fill rule.
    const renderDayTick = useCallback(
        (tickProps: {
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
                    style={isToday ? { fill: 'var(--color-text-strong)' } : undefined}
                >
                    {payload ? dayOfMonth(payload.value) : ''}
                </Text>
            );
        },
        [todayDateKey]
    );

    // Over a band → just that series; above the stack → the full per-day list. Rows are
    // sorted by the day's value (Rest last) since the payload arrives in month-total order.
    const renderTooltip = useCallback(
        (props: TooltipProps<number, string>) => {
            const present = props.payload?.filter((p) => typeof p.value === 'number' && p.value !== 0);
            const sorted = present?.slice().sort((a, b) => {
                if (a.dataKey === REST_SERIES_KEY) return 1;
                if (b.dataKey === REST_SERIES_KEY) return -1;
                return (b.value ?? 0) - (a.value ?? 0);
            });
            const shown = hoveredKey ? sorted?.filter((p) => p.dataKey === hoveredKey) : sorted;
            return <ChartTooltipContent active={props.active} label={props.label} payload={shown} labelFormatter={(value) => formatTooltipDate(value)} />;
        },
        [hoveredKey]
    );

    return (
        <ChartContainer config={config} className="flex-1 min-h-0 w-full">
            <ChartComponent accessibilityLayer data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barCategoryGap={4}>
                {/* syncWithTicks: draw grid lines only at the axis ticks. Without it, the YAxis
                    `padding.top` shifts the top tick off the plot's top edge and recharts back-fills a
                    stray line at that edge — a phantom gridline above the top tick. */}
                <CartesianGrid vertical={false} syncWithTicks strokeDasharray="3 3" stroke="var(--color-border-muted)" />
                <XAxis
                    dataKey="date"
                    tickLine={false}
                    tickMargin={10}
                    stroke="var(--color-surface-panel-muted)"
                    // tickFormatter still drives recharts' tick-spacing math even though the custom tick re-derives the day.
                    tickFormatter={(value: string) => String(dayOfMonth(value))}
                    tick={renderDayTick}
                />
                <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => formatQuantity(value)}
                    padding={{ top: 20 }}
                    // Round ticks + headroom above the cap line (nice tick values, cap not pinned to the top).
                    domain={capAxis ? [0, capAxis.max] : undefined}
                    ticks={capAxis?.ticks}
                />
                <ChartTooltip content={renderTooltip} isAnimationActive={false} />
                {seriesElements}
                {capLine !== undefined && (
                    <ReferenceLine
                        y={capLine}
                        stroke="var(--color-icon-danger)"
                        strokeDasharray="4 4"
                        strokeOpacity={0.6}
                        label={{ value: 'Limit', position: 'top', fill: 'var(--color-icon-danger)', fontSize: 11, offset: 6 }}
                    />
                )}
            </ChartComponent>
        </ChartContainer>
    );
};
