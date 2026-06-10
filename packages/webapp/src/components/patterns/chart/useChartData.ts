import { useMemo } from 'react';

import type { ChartSeries } from './types';
import type { ApiBillingUsageMetric } from '@nangohq/types';

type UsageSeries = { timeframeStart: string | Date; quantity: number }[];

// `type` (not interface) so it keeps an implicit index signature and stays assignable to the
// Record<string, …> `chartData` prop that BreakdownChart expects.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type BaseChartRow = { date: string; total: number | null | undefined };
export type BreakdownChartRow = Record<string, string | number | null>;

/** Build a `YYYY-MM-DD` (UTC) → quantity lookup from a usage series, for fast per-day reads. */
function usageToDateMap(usage: UsageSeries): Map<string, number> {
    const map = new Map<string, number>();
    usage.forEach((u) => {
        const dateStr = typeof u.timeframeStart === 'string' ? u.timeframeStart : u.timeframeStart.toISOString();
        map.set(dateStr.split('T')[0], u.quantity);
    });
    return map;
}

/** Days (`YYYY-MM-DD`, UTC) spanning the timeframe, end-exclusive. */
export function daysInTimeframe(timeframe: { start: string; end: string }): string[] {
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

/**
 * Per-day rows for the base (single-series) chart.
 *
 * Days after today are left blank (null) rather than plotted as 0, so the chart ends
 * with a vertical edge at the present instead of sloping down to zero across the rest
 * of the month. A genuine 0 in the past keeps its value (and the smooth curve down);
 * a missing past day is `undefined`. (String compare is safe: both are YYYY-MM-DD, UTC.)
 */
export function buildBaseChartData(data: ApiBillingUsageMetric | undefined, timeframe: { start: string; end: string }, todayDateKey: string): BaseChartRow[] {
    if (!data) return [];
    const usageMap = usageToDateMap(data.usage);
    return daysInTimeframe(timeframe).map((date) => ({ date, total: date > todayDateKey ? null : (usageMap.get(date) ?? undefined) }));
}

/**
 * Per-day rows for the breakdown (stacked) chart: `{ date, [seriesKey]: value }`.
 * Future days are blanked (null) like the base chart; a missing past day is 0 so the
 * stack stays grounded rather than leaving a gap.
 */
export function buildBreakdownChartData(
    breakdownSeries: ChartSeries[] | undefined,
    timeframe: { start: string; end: string },
    todayDateKey: string
): BreakdownChartRow[] {
    if (!breakdownSeries) return [];
    const maps = breakdownSeries.map((s) => usageToDateMap(s.usage));
    return daysInTimeframe(timeframe).map((date) => {
        const row: BreakdownChartRow = { date };
        breakdownSeries.forEach((s, i) => {
            row[s.key] = date > todayDateKey ? null : (maps[i].get(date) ?? 0);
        });
        return row;
    });
}

/**
 * "No data this month", a property of the base metric (independent of breakdown).
 * Guarded on `data` being defined — an empty array is vacuously "every" falsy, which
 * would collapse the card to its empty state before the first response arrives.
 */
export function isBaseUsageEmpty(data: ApiBillingUsageMetric | undefined, baseChartData: BaseChartRow[]): boolean {
    return data !== undefined && baseChartData.every((d) => !d.total);
}

/** Per-day chart rows for the base (single-series) and breakdown (stacked) charts, plus the empty-state flag. */
export function useChartData(data: ApiBillingUsageMetric | undefined, breakdownSeries: ChartSeries[] | undefined, timeframe: { start: string; end: string }) {
    // Computed each render (not memoized on []) so a dashboard left open past midnight
    // rolls over to the new day. The value is stable within a day, so the memos below
    // (keyed on it) don't recompute until the date actually changes.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayDateKey = today.toISOString().split('T')[0];

    // `data` (React Query) and `timeframe` (memoized upstream) are stable references, so
    // depending on them whole recomputes at the same times as granular field deps would.
    const baseChartData = useMemo(() => buildBaseChartData(data, timeframe, todayDateKey), [data, timeframe, todayDateKey]);
    const breakdownChartData = useMemo(() => buildBreakdownChartData(breakdownSeries, timeframe, todayDateKey), [breakdownSeries, timeframe, todayDateKey]);

    const isEmpty = isBaseUsageEmpty(data, baseChartData);

    return { todayDateKey, baseChartData, breakdownChartData, isEmpty };
}
