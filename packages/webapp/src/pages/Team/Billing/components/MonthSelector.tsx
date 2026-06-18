import { ChevronLeft, ChevronRight } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { useEffect, useMemo } from 'react';

import { IconButton } from '@nangohq/design-system';

import { EARLIEST_USAGE_MONTH_MS } from '../usageBreakdown';
import { useBreakdownEnabled } from '../useBreakdownEnabled';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';

// Parser for month in YYYY-MM format
const parseMonth = parseAsString.withDefault('').withOptions({ history: 'replace' });

const EARLIEST_USAGE_MONTH_LABEL = new Date(EARLIEST_USAGE_MONTH_MS).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

interface MonthSelectorProps {
    onMonthChange?: (month: Date) => void;
}

export const MonthSelector: React.FC<MonthSelectorProps> = ({ onMonthChange }) => {
    // Sync selected month with URL query params
    const [monthParam, setMonthParam] = useQueryState('month', parseMonth);

    // The June 2026 floor only applies while the breakdown (ClickHouse) view is
    // active — that's the data that starts then. Legacy Orb accounts keep full history.
    const breakdownEnabled = useBreakdownEnabled();

    // Convert URL param to Date, defaulting to current month. When the breakdown view
    // is active, never resolve earlier than the floor (clamps stale/tampered URLs).
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
        return breakdownEnabled && month.getTime() < EARLIEST_USAGE_MONTH_MS ? new Date(EARLIEST_USAGE_MONTH_MS) : month;
    }, [monthParam, breakdownEnabled]);

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

    // Disable the previous button at the June 2026 floor, but only while the breakdown
    // view is active; otherwise legacy history stays navigable.
    const canGoPrevious = useMemo(() => !breakdownEnabled || selectedMonth.getTime() > EARLIEST_USAGE_MONTH_MS, [breakdownEnabled, selectedMonth]);

    const previousButton = (
        <IconButton variant="ghost" size="2xs" onClick={handlePreviousMonth} disabled={!canGoPrevious} label="Previous month">
            <ChevronLeft />
        </IconButton>
    );

    return (
        <div className="self-end flex items-center gap-2">
            {canGoPrevious ? (
                previousButton
            ) : (
                <Tooltip>
                    {/* Span wrapper so the disabled button still surfaces the tooltip on hover/focus. */}
                    <TooltipTrigger asChild>
                        <span className="inline-flex" tabIndex={0}>
                            {previousButton}
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>Usage tracking is only available from {EARLIEST_USAGE_MONTH_LABEL}.</TooltipContent>
                </Tooltip>
            )}
            <span className="text-text-strong text-body-medium-medium min-w-28 text-center">{monthDisplay}</span>
            <IconButton variant="ghost" size="2xs" onClick={handleNextMonth} disabled={!canGoNext} label="Next month">
                <ChevronRight />
            </IconButton>
        </div>
    );
};
