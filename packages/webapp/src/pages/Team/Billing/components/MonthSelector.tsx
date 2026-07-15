import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo } from 'react';

import { IconButton } from '@nangohq/design-system';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';
import { track } from '@/utils/analytics';
import { EARLIEST_USAGE_MONTH_MS } from '../usageBreakdown';
import { useSelectedMonth } from '../useSelectedMonth';

const EARLIEST_USAGE_MONTH_LABEL = new Date(EARLIEST_USAGE_MONTH_MS).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

interface MonthSelectorProps {
    onMonthChange?: (month: Date) => void;
}

export const MonthSelector: React.FC<MonthSelectorProps> = ({ onMonthChange }) => {
    const { selectedMonth, setSelectedMonth, canGoNext, canGoPrevious } = useSelectedMonth();

    // Notify parent when month changes
    useEffect(() => {
        onMonthChange?.(selectedMonth);
    }, [selectedMonth, onMonthChange]);

    const monthDisplay = useMemo(() => {
        return selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    }, [selectedMonth]);

    const handlePreviousMonth = () => {
        track('web:usage:month_changed', { direction: 'previous' });
        const newDate = new Date(selectedMonth);
        newDate.setUTCMonth(selectedMonth.getUTCMonth() - 1);
        setSelectedMonth(newDate);
    };

    const handleNextMonth = () => {
        track('web:usage:month_changed', { direction: 'next' });
        const newDate = new Date(selectedMonth);
        newDate.setUTCMonth(selectedMonth.getUTCMonth() + 1);
        setSelectedMonth(newDate);
    };

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
