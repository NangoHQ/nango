import { ChevronLeft, ChevronRight } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { useEffect, useMemo } from 'react';

import { Button } from '@/components/ui/Button';

// Parser for month in YYYY-MM format
const parseMonth = parseAsString.withDefault('').withOptions({ history: 'replace' });

// Earliest month with usage data we surface. Granular ClickHouse data only goes
// back to June 2026 (daily_raw_* ingestion began ~2026-05-12 with a mid-May gap,
// so May is partial), and we no longer expose the partial earlier months at all.
const EARLIEST_USAGE_MONTH = new Date(Date.UTC(2026, 5, 1)); // June 2026

interface MonthSelectorProps {
    onMonthChange?: (month: Date) => void;
}

export const MonthSelector: React.FC<MonthSelectorProps> = ({ onMonthChange }) => {
    // Sync selected month with URL query params
    const [monthParam, setMonthParam] = useQueryState('month', parseMonth);

    // Convert URL param to Date, defaulting to current month, and never resolve
    // earlier than the earliest month we have data for (clamps stale/tampered URLs).
    const selectedMonth = useMemo(() => {
        const currentMonth = () => {
            const now = new Date();
            return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        };
        let month = currentMonth();
        if (monthParam) {
            const [year, m] = monthParam.split('-').map(Number);
            if (!isNaN(year) && !isNaN(m) && m >= 1 && m <= 12) {
                month = new Date(Date.UTC(year, m - 1, 1));
            }
        }
        return month.getTime() < EARLIEST_USAGE_MONTH.getTime() ? EARLIEST_USAGE_MONTH : month;
    }, [monthParam]);

    // Notify parent when month changes
    useEffect(() => {
        onMonthChange?.(selectedMonth);
    }, [selectedMonth, onMonthChange]);

    // Update URL param when month changes
    const setSelectedMonth = (date: Date) => {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        void setMonthParam(`${year}-${month}`);
    };

    const monthDisplay = useMemo(() => {
        return selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    }, [selectedMonth]);

    const handlePreviousMonth = () => {
        const newDate = new Date(selectedMonth);
        newDate.setUTCMonth(selectedMonth.getUTCMonth() - 1);
        setSelectedMonth(newDate);
    };

    const handleNextMonth = () => {
        const newDate = new Date(selectedMonth);
        newDate.setUTCMonth(selectedMonth.getUTCMonth() + 1);
        setSelectedMonth(newDate);
    };

    // Disable next button if trying to go to future months
    const canGoNext = useMemo(() => {
        const now = new Date();
        const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        return selectedMonth < currentMonth;
    }, [selectedMonth]);

    // Disable previous button at the earliest month with data (June 2026).
    const canGoPrevious = useMemo(() => selectedMonth.getTime() > EARLIEST_USAGE_MONTH.getTime(), [selectedMonth]);

    return (
        <div className="self-end flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handlePreviousMonth} disabled={!canGoPrevious}>
                <ChevronLeft />
            </Button>
            <span className="text-text-primary text-body-medium-medium min-w-28 text-center">{monthDisplay}</span>
            <Button variant="ghost" size="icon" onClick={handleNextMonth} disabled={!canGoNext}>
                <ChevronRight />
            </Button>
        </div>
    );
};
