import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo } from 'react';

import { IconButton } from '@nangohq/design-system';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';
import { track } from '@/utils/analytics';
import { EARLIEST_USAGE_MONTH_MS } from '../usageBreakdown';
import { useSelectedMonth } from '../useSelectedMonth';

const EARLIEST_USAGE_MONTH_LABEL = new Date(EARLIEST_USAGE_MONTH_MS).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

interface MonthSelectorProps {
    /** Notified whenever the selected month changes (backed by the shared `?month` param). */
    onMonthChange?: (month: Date) => void;
}

/**
 * Month selector backed by the shared `?month` param (`useSelectedMonth`): chevron buttons flanking
 * a fixed-width month label (so the arrows don't shift between months), with the disabled "previous"
 * button surfacing the earliest-month tooltip. Used in both the paid usage page header and the Free
 * caps table header.
 */
export const MonthSelector: React.FC<MonthSelectorProps> = ({ onMonthChange }) => {
    const { selectedMonth, setSelectedMonth, canGoNext, canGoPrevious } = useSelectedMonth();

    useEffect(() => {
        onMonthChange?.(selectedMonth);
    }, [selectedMonth, onMonthChange]);

    const monthDisplay = useMemo(() => selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }), [selectedMonth]);

    const step = (delta: number) => {
        track('web:usage:month_changed', { direction: delta < 0 ? 'previous' : 'next' });
        const next = new Date(selectedMonth);
        next.setUTCMonth(selectedMonth.getUTCMonth() + delta);
        setSelectedMonth(next);
    };

    const previousButton = (
        <IconButton variant="ghost" size="2xs" onClick={() => step(-1)} disabled={!canGoPrevious} label="Previous month">
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
                        <span className="inline-flex rounded-[2px] focus-visible:outline-none focus-visible:shadow-focus-outline-default" tabIndex={0}>
                            {previousButton}
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>Usage tracking is only available from {EARLIEST_USAGE_MONTH_LABEL}.</TooltipContent>
                </Tooltip>
            )}
            <span className="text-text-strong text-body-medium-medium min-w-28 text-center">{monthDisplay}</span>
            <IconButton variant="ghost" size="2xs" onClick={() => step(1)} disabled={!canGoNext} label="Next month">
                <ChevronRight />
            </IconButton>
        </div>
    );
};
