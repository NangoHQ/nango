import { parseAsString, useQueryState } from 'nuqs';
import { useMemo } from 'react';

import { EARLIEST_USAGE_MONTH_MS } from './usageBreakdown';
import { useBreakdownEnabled } from './useBreakdownEnabled';

// Parser for month in YYYY-MM format, shared across the page header and the per-metric drill-in
// steppers so they all read/write the same `?month` param and stay in sync.
const parseMonth = parseAsString.withDefault('').withOptions({ history: 'replace' });

interface UseSelectedMonth {
    selectedMonth: Date;
    setSelectedMonth: (date: Date) => void;
    /** False once at the current month (no future navigation). */
    canGoNext: boolean;
    /** False at the June-2026 ClickHouse floor while the breakdown view is active. */
    canGoPrevious: boolean;
    breakdownEnabled: boolean;
}

/**
 * Selected usage month, backed by the `?month` URL param. The June-2026 floor only applies while
 * the breakdown (ClickHouse) view is active — that's when the data starts; legacy Orb accounts keep
 * full history. Any component reading this hook stays in sync via the shared param.
 */
export function useSelectedMonth(): UseSelectedMonth {
    const [monthParam, setMonthParam] = useQueryState('month', parseMonth);
    const breakdownEnabled = useBreakdownEnabled();

    const selectedMonth = useMemo(() => {
        const now = new Date();
        let month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        if (monthParam) {
            const [year, m] = monthParam.split('-').map(Number);
            if (!isNaN(year) && !isNaN(m) && m >= 1 && m <= 12) {
                month = new Date(Date.UTC(year, m - 1, 1));
            }
        }
        return breakdownEnabled && month.getTime() < EARLIEST_USAGE_MONTH_MS ? new Date(EARLIEST_USAGE_MONTH_MS) : month;
    }, [monthParam, breakdownEnabled]);

    const setSelectedMonth = (date: Date) => {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        void setMonthParam(`${year}-${month}`);
    };

    const canGoNext = useMemo(() => {
        const now = new Date();
        const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        return selectedMonth < currentMonth;
    }, [selectedMonth]);

    const canGoPrevious = useMemo(() => !breakdownEnabled || selectedMonth.getTime() > EARLIEST_USAGE_MONTH_MS, [breakdownEnabled, selectedMonth]);

    return { selectedMonth, setSelectedMonth, canGoNext, canGoPrevious, breakdownEnabled };
}
