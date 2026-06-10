import { useMemo } from 'react';

import type { ChartSeries } from './chart';
import type { ApiBillingUsageMetric } from '@nangohq/types';

/** Build a `YYYY-MM-DD` (UTC) → quantity lookup from a usage series, for fast per-day reads. */
function usageToDateMap(usage: { timeframeStart: string | Date; quantity: number }[]): Map<string, number> {
    const map = new Map<string, number>();
    usage.forEach((u) => {
        const dateStr = typeof u.timeframeStart === 'string' ? u.timeframeStart : u.timeframeStart.toISOString();
        map.set(dateStr.split('T')[0], u.quantity);
    });
    return map;
}

/** Days (`YYYY-MM-DD`, UTC) spanning the timeframe, end-exclusive. */
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

/**
 * Per-day chart rows for the base (single-series) and breakdown (stacked) charts.
 *
 * Days after today are left blank (null) rather than plotted as 0, so the chart ends
 * with a vertical edge at the present instead of sloping down to zero across the rest
 * of the month. A genuine 0 in the past keeps its value (and the smooth curve down) —
 * only future days are blanked. (String compare is safe: both are YYYY-MM-DD, UTC.)
 */
export function useChartData(data: ApiBillingUsageMetric | undefined, breakdownSeries: ChartSeries[] | undefined, timeframe: { start: string; end: string }) {
    const todayDateKey = useMemo(() => {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        return today.toISOString().split('T')[0];
    }, []);

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

    // "No data this month" is a property of the base metric, independent of breakdown.
    const isEmpty = baseChartData.every((d) => !d.total);

    return { todayDateKey, baseChartData, breakdownChartData, isEmpty };
}
